'use strict'

const http = require('http')
const ask = require('./ask')
const upnp = require('./upnp')

// Handle CTRL+C
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT')
    process.exit()
})

// https://nodejs.org/api/http.html#http_http_get_url_options_callback
function stream(url) {
    const req = http.get(url, (res) => {
        console.log(res.statusCode, res.statusMessage)
        console.log(res.headers)

        let downloadedBytes = 0
        res.on('error', (err) => {
            console.error(err)
        })
        res.on('data', (chunk) => {
            downloadedBytes += chunk.length
            process.stdout.write('.')
        })
        res.on('end', () => {
            console.log(`\nactual bytes downloaded = ${downloadedBytes}`)
        })
    })
}

async function browse(mediaServers) {
    let choices
    let answer

    // Ask user to choose media server
    choices = mediaServers.map(mediaServer => mediaServer.friendlyName)
    answer = await ask(choices, { color: 208 })
    if (answer === -1) return
    console.log(choices[answer])

    // Browse directories and files
    const mediaServer = mediaServers[answer]
    let objectId = 0
    let isContainer = true
    let choice
    while (isContainer) {
        let contents = await mediaServer.browse(objectId)
        if (contents.length === 0) break

        choices = contents.map(content => content.title)
        console.log(`What do you want to listen today? (${choices.length})`)
        answer = await ask(choices, { color: 6 })
        console.log(choices[answer])

        objectId = contents[answer].id
        isContainer = contents[answer].isContainer
        choice = contents[answer]
    }

    console.log(choice)
    if (choice) stream(choice.url)
}

function main() {
    const mediaServers = []
    const watcher = upnp.discover()
    watcher.on('error', (err) => {
        console.error(`discover error:\n${err}`)
    })
    watcher.on('listening', (address) => {
        //console.log(`Local client listening on ${address.address}:${address.port}`)
    })
    watcher.on('mediaServer', (mediaServer) => {
        setImmediate(async () => {
            try {
                mediaServers.push(mediaServer)
                console.log(mediaServer)
            }
            catch (err) {
                console.error(err)
            }
        })
    })
    watcher.on('end', () => {
        console.log(`${mediaServers.length} media servers found.`)
        if (mediaServers.length > 0) {
            browse(mediaServers).catch(err => console.error(err))
        }
    })
}

main()
