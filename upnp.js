'use strict'

const dgram = require('dgram')
const util = require('util')
const xml2js = require('xml2js')
const URL = require('url').URL
const EventEmitter = require('events')
const fetch = require('./fetch')

// Parse SSDP (Simple Service Discovery Protocol) response
function parseHttpResponse(res) {
    const lines = res.split('\r\n')
    const status = lines[0]
    const fields = lines.slice(1)

    const headers = {}
    for (const field of fields) {
        if (field.length !== 0) {
            const match = field.match(/([a-zA-Z0-9-]+): *(.*)/)
            headers[match[1].toLowerCase()] = match[2]
        }
    }
    return { status, headers }
}

function getAddressAndPort(addr) {
    return `${addr.address}:${addr.port}`
}

class MediaServer {
    #ssdpResponse
    #ssdpRinfo
    #description
    #controlURL
    friendlyName

    constructor(msg, rinfo) {
        this.#ssdpResponse = parseHttpResponse(msg.toString())
        this.#ssdpRinfo = rinfo
    }

    async getDescription() {
        this.#description = await this.getXMLDescription()
        this.friendlyName = this.#description.root.device[0].friendlyName[0]
        this.#controlURL = this.getControlURL()
    }

    async getXMLDescription() {
        // Get XML file
        const url = this.#ssdpResponse.headers.location
        const response =  await fetch.get(url)
        //console.debug(`${new Date().toISOString()} ${getAddressAndPort(response.request.socket.address())} << GET ${url}`)
        if (response.statusCode !== 200 || !response.headers['content-type'].includes('text/xml')) {
            throw new Error(`Failed to download XML file from ${url}`)
        }
        // Convert XML to JavaScript object
        const xml = response.data
        //console.debug(xml)
        const description = await xml2js.parseStringPromise(xml)
        //console.debug(util.inspect(description, { depth: Infinity, colors: true }))
        return description
    }

    getServiceById(serviceId) {
        const services = this.#description.root.device[0].serviceList[0].service
        for (const s of services) {
            if (s.serviceId[0] === serviceId) {
                return s
            }
        }
        throw new Error(`Can't find service with serviceId ${serviceId}`)
    }

    getControlURL() {
        const service = this.getServiceById('urn:upnp-org:serviceId:ContentDirectory')
        const origin = new URL(this.#ssdpResponse.headers.location).origin // e.g. http://192.168.0.169:6000
        const controlURL = new URL(service.controlURL, origin).href // e.g. http://192.168.0.169:6000/ContentDirectory/control
        return controlURL
    }

    async browse(objectId = 0) {
        try {
            const headers = {
                'accept': 'text/xml',
                'content-type': 'text/xml; charset="utf-8"',
                'soapaction': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"'
            }
            const body = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
                + '<s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">'
                + `<ObjectID>${objectId}</ObjectID>`
                + '<BrowseFlag>BrowseDirectChildren</BrowseFlag>'
                + '<Filter>*</Filter>'
                + '<StartingIndex>0</StartingIndex>'
                + '<RequestedCount>5000</RequestedCount>'
                + '<SortCriteria></SortCriteria>'
                + '</u:Browse>'
                + '</s:Body>'
                + '</s:Envelope>'

            const response = await fetch.post(this.#controlURL, { timeout: 4000, headers, body })
            //console.log(`${new Date().toISOString()} ${getAddressAndPort(response.request.socket.address())} << POST ${this.controlURL}`)
            //console.debug(response)
            if (response.statusCode === 200 && response.headers['content-type'].includes('text/xml')) {
                const xml = response.data
                let result = await xml2js.parseStringPromise(xml)
                //console.log(util.inspect(result, false, null))

                // Inspect 'BrowseResponse'
                const browseResponse = result['s:Envelope']['s:Body'][0]['u:BrowseResponse'][0]
                result = await xml2js.parseStringPromise(browseResponse.Result[0])

                const contents = []
                const containers = result['DIDL-Lite'].container ?? []
                for (const container of containers) {
                    const content = container['$']
                    content.title = container['dc:title'][0]
                    content.class = container['upnp:class'][0]
                    content.isContainer = true
                    contents.push(content)
                }
                const items = result['DIDL-Lite'].item ?? []
                for (const item of items) {
                    const content = item['$']
                    content.title = item['dc:title'][0]
                    content.class = item['upnp:class'][0]
                    content.isContainer = false
                    content.url = item.res[0]._
                    content.size = item.res[0]['$'].size
                    content.duration = item.res[0]['$'].duration
                    contents.push(content)
                }
                return contents
            }
        }
        catch (err) {
            console.error(err)
        }
    }
}

// Send out a multicast M-SEARCH message
function sendMSearch(sock) {
    const address = '239.255.255.250'
    const port = 1900
    const msg = 'M-SEARCH * HTTP/1.1\r\n'
        + `HOST: ${address}:${port}\r\n`
        + 'MAN: "ssdp:discover"\r\n'
        + 'MX: 5\r\n'
        + 'ST: urn:schemas-upnp-org:device:MediaServer:1\r\n'
        //+ 'ST: upnp:rootdevice\r\n'
        + '\r\n'
    console.log(`${new Date().toISOString()} ${getAddressAndPort(sock.address())} >> ${address}:${port}`)
    console.log(msg)
    sock.send(msg, port, address)
}

class MediaServerWatcher extends EventEmitter {}

function discover(timeout = 5000) {
    const watcher = new MediaServerWatcher()
    const sock = dgram.createSocket('udp4')
    sock.on('error', (err) => {
        sock.close()
        watcher.emit('error', err)
    })
    sock.on('listening', () => {
        // Socket is ready to receive data
        sendMSearch(sock)
        setTimeout(() => {
            sock.close()
            watcher.emit('end')
        }, timeout)
        watcher.emit('listening', sock.address())
    })
    sock.on('message', async (msg, rinfo) => {
        // A media server responded to our M-SEARCH message
        console.log(`${new Date().toISOString()} ${getAddressAndPort(sock.address())} << ${rinfo.address}:${rinfo.port}`)
        const mediaServer = new MediaServer(msg, rinfo)
        await mediaServer.getDescription()
        watcher.emit('mediaServer', mediaServer)
    })

    sock.bind()
    return watcher
}

module.exports = { discover }
