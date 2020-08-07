'use strict'

const ask = require('./ask')
const upnp = require('./upnp')

// Handle CTRL+C
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT')
    process.exit()
})

async function browse(devices) {
    let choices
    let answer

    // Ask user to choose device
    choices = devices.map(device => device.friendlyName)
    //console.log(`Choose device: (${choices.length})`)
    answer = await ask(choices, { color: 208 })
    if (answer === -1) return
    console.log(choices[answer])

    // Browse directories and files
    const device = devices[answer]
    let objectId = 0
    let isContainer = true
    let choice
    while (isContainer) {
        let items = await device.browse(objectId)
        if (items.length === 0) break

        choices = items.map(item => item.title)
        console.log(`What do you want to listen today? (${choices.length})`)
        answer = await ask(choices, { color: 6 })
        if (answer === -1) break
        console.log(choices[answer])
    
        objectId = items[answer].id
        isContainer = items[answer].isContainer
        choice = items[answer]
    }

    console.log(choice)
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
