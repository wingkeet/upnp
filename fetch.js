'use strict'

const http = require('http')
const https = require('https')

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

function isSuccess(statusCode) {
    return statusCode >= 200 && statusCode <= 299
}

function isRedirect(statusCode) {
    return statusCode >= 300 && statusCode <= 399
}

// https://en.wikipedia.org/wiki/ANSI_escape_code#3/4_bit
const CYAN = '\x1b[36m%s\x1b[0m'

// https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_http_request_url_options_callback
function fetch(url, options) {
    return new Promise((resolve, reject) => {
        const maxRedirects = Number(options.maxRedirects) || 0
        let redirects = 0
        httpRequest(url)

        function httpRequest(url) {
            const protocol = getProtocol(url)
            const req = protocol.request(url, options, (res) => {
                const { statusCode, statusMessage, headers } = res
                if (options.verbose) {
                    console.log(CYAN, 'RESPONSE:')
                    console.log(`HTTP/${res.httpVersion} ${statusCode} ${statusMessage}`)
                    console.log(headers)
                }

                if (isRedirect(statusCode) && redirects < maxRedirects) {
                    res.resume()
                    redirects++
                    const redirectURL = new URL(headers.location, url).href
                    setImmediate(httpRequest, redirectURL)
                    return
                }

                let buffer = Buffer.allocUnsafe(0)
                res.on('data', (chunk) => {
                    buffer = Buffer.concat([buffer, chunk])
                })
                res.on('end', () => {
                    let data = buffer.toString()
                    if (headers['content-type']?.includes('application/json')) {
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
                    console.log(CYAN, 'REQUEST:')
                    console.log('SOURCE:', req.socket.address())
                    console.log('DESTINATION:', url)
                    process.stdout.write(req._header)
                    console.log(options.body)
                }
            })
        }
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
        body,
    }
    return await fetch(url, options)
}

module.exports = { get, post, json }
