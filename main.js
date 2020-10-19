'use strict'

const cp = require('child_process')
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

        let bytes = 0
        res.on('error', (err) => {
            console.error(err)
        })
        res.on('data', (chunk) => {
            bytes += chunk.length
            process.stdout.write('.')
        })
        res.on('end', () => {
            const ok = bytes == res.headers['content-length']
            console.log(`\nactual bytes downloaded = ${bytes} (ok=${ok})`)
        })
    })
}

// `ffplay` is included in FFmpeg (https://ffmpeg.org/)
// `gst-play-1.0` is included in GStreamer (https://gstreamer.freedesktop.org/)
function play(url) {
    //const cmd = `ffplay -nodisp -loglevel quiet -autoexit -t 10 ${url}`
    const cmd = `gst-play-1.0 ${url}`
    console.log(cmd)
    const args = cmd.split(' ')

    cp.execFile(args[0], args.slice(1), (err, stdout, stderr) => {
        if (err) {
            console.error(`execFile error: ${err}`)
            return
        }
    })
}

async function browse(mediaServers) {
    const orange = 208;
    const cyan = 14;
    let choices
    let answer

    // Ask user to choose media server
    choices = mediaServers.map(mediaServer => mediaServer.friendlyName + '/')
    answer = await ask(choices, { color: orange })
    console.log(`\x1b[38;5;${orange}m${choices[answer]}\x1b[0m`)

    // Browse directories and files
    const mediaServer = mediaServers[answer]
    let objectId = 0
    let isContainer = true
    let choice
    while (isContainer) {
        let contents = await mediaServer.browse(objectId)
        if (contents.length === 0) break

        choices = contents.map(content => content.isContainer ? content.title + '/' : content.title)
        console.log(`What do you want to listen today? (${choices.length})`)
        answer = await ask(choices, { color: cyan })
        console.log(`\x1b[38;5;${cyan}m${choices[answer]}\x1b[0m`)

        choice = contents[answer]
        objectId = choice.id
        isContainer = choice.isContainer
    }

    console.log(choice)
    if (choice) play(choice.url) // call stream() or play()
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
        mediaServers.push(mediaServer)
        console.log(mediaServer)
    })
    watcher.on('end', () => {
        console.log(`Found ${mediaServers.length} media servers.`)
        if (mediaServers.length > 0) {
            browse(mediaServers).catch(err => console.error(err))
        }
    })
}

main()
