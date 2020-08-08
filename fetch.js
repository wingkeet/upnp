'use strict'

const http = require('http')
const https = require('https')
const URL = require('url').URL

function getProtocol(url) {
    switch (new URL(url).protocol) {
        case 'http:':
            return http
        case 'https:':
            return https
        default:
            throw new Error('Unsupported protocol')
    }
}

// https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_http_request_url_options_callback
async function fetch(url, options) {
    return new Promise((resolve, reject) => {

        const protocol = getProtocol(url)
        const req = protocol.request(url, options, (res) => {
            const { statusCode, statusMessage } = res
            if (options.verbose) {
                console.log(`HTTP/${res.httpVersion} ${statusCode} ${statusMessage}`)
                console.log(res.headers)
            }

            let buffer = Buffer.allocUnsafe(0)
            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk])
            })
            res.on('end', () => {
                let data = buffer.toString()
                const contentType = res.headers['content-type']
                if (contentType.includes('application/json')) {
                    try {
                        data = JSON.parse(data)
                    }
                    catch (err) {
                        const result = { statusCode, statusMessage,
                            headers: res.headers, buffer, data, error: err }
                        reject(result)
                        return
                    }
                }
                const result = { statusCode, statusMessage, headers: res.headers, buffer, data }
                res.statusCode === 200 ? resolve(result) : reject(result)
            })
        })

        req.on('error', (err) => reject(err))
        if (options.method === 'POST' && options.body) {
            req.setHeader('content-length', options.body.length)
            req.write(options.body)
        }
        req.end(() => {
            if (options.verbose) {
                console.log(req.socket.address())
                console.log(req._header)
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
    return await fetch(url, options)
}

module.exports = { get, post }
