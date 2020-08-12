'use strict'

const http = require('http')
const https = require('https')
const { URL } = require('url')

function getProtocol(url) {
    const protocol = new URL(url).protocol
    switch (protocol) {
        case 'http:':
            return http
        case 'https:':
            return https
        default:
            throw new Error(`Unsupported protocol '${protocol}'`)
    }
}

function success(statusCode) {
    return statusCode >= 200 && statusCode < 300
}

// https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_http_request_url_options_callback
async function fetch(url, options) {
    return new Promise((resolve, reject) => {

        const protocol = getProtocol(url)
        const req = protocol.request(url, options, (res) => {
            const { statusCode, statusMessage, headers } = res
            if (options.verbose) {
                console.log('Response HTTP status/headers:')
                console.log(`HTTP/${res.httpVersion} ${statusCode} ${statusMessage}`)
                console.log(headers)
            }

            if (!success(statusCode)) {
                res.resume()
                reject(new Error(`statusCode: ${statusCode}, statusMessage: ${statusMessage}`))
                return
            }

            let buffer = Buffer.allocUnsafe(0)
            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk])
            })
            res.on('end', () => {
                let data = buffer.toString()
                const contentType = headers['content-type']
                if (contentType.includes('application/json')) {
                    try {
                        data = JSON.parse(data)
                    }
                    catch (err) {
                        reject(err)
                        return
                    }
                }
                resolve({ statusCode, statusMessage, headers, buffer, data })
            })
        })

        req.on('error', (err) => reject(err))
        if (options.method === 'POST' && options.body) {
            req.write(options.body)
        }
        req.end(() => {
            if (options.verbose) {
                console.log('Request address/port/headers/body:')
                console.log(req.socket.address())
                process.stdout.write(req._header)
                console.log(options.body)
            }
        })
    })
}

async function get(url, options = {}) {
    options.method = 'GET'
    return await fetch(url, options)
}

async function post(url, options = {}) {
    options.method = 'POST'
    options.headers['content-length'] = options.body ? Buffer.byteLength(options.body) : 0
    return await fetch(url, options)
}

async function json(url, obj) {
    const body = JSON.stringify(obj)
    const options = {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json; charset=utf-8',
            'content-length': body ? Buffer.byteLength(body) : 0,
        },
        body
    }
    return await fetch(url, options)
}

module.exports = { get, post, json }
