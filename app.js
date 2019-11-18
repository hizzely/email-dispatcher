'use strict'
const dotenv = require('dotenv').config()
const express = require('express')
const fs = require('fs')
const mustache = require('mustache')
const nodemailer = require('nodemailer')

const app = express()
const env = dotenv.parsed
const port = env.APP_PORT || 3000

const defaultState = {finished: [], queue: []}
let state = {}
let stateLocked = false

function loadStateSync() {
    try {
        let data = JSON.parse(fs.readFileSync('data.json', { encoding: 'utf8', flag: 'r' }))
        return { status: true, data: data }
    } catch (error) {
        return { status: false }
    }
}

function saveStateSync(currentState) {
    fs.writeFileSync('data.json', JSON.stringify(currentState), { flag: 'w'}, (err) => {
        if (err) return false
        return true
    })
}

function getTimestamp(getDate = true, getTime = true, trimDelimiter = false) {
    const d = new Date()
    const year = d.getFullYear()
    const month = d.getMonth()+1 >= 10 ? d.getMonth()+1 : '0' + d.getMonth()+1
    const date = d.getDate() >= 10 ? d.getDate() : '0' + d.getDate()
    const hours = d.getHours() >= 10 ? d.getHours() : '0' + d.getHours()
    const minutes = d.getMinutes() >= 10 ? d.getMinutes() : '0' + d.getMinutes()
    const seconds = d.getSeconds() >= 10 ? d.getSeconds() : '0' + d.getSeconds()

    const dateOnly = `${year}/${month}/${date}`
    const timeOnly = `${hours}:${minutes}:${seconds}`

    let timestamp = ''

    if (getDate)
        timestamp = dateOnly
    if (getTime)
        timestamp += ' ' + timeOnly
    if (trimDelimiter) {
        timestamp = timestamp.replace(/\//g, '')
        timestamp = timestamp.replace(/:/g, '')
    }

    return timestamp.trim()
}

function writeLog(text, withTimestamp = true, echo = true) {
    return new Promise((resolve, reject) => {
        const logFile = `${env.APP_LOG_FOLDER}/${env.APP_LOG_PREFIX}${getTimestamp(true, false, true)}.txt` 
        let content = ''
        
        if (withTimestamp)
            content = `[${getTimestamp(true, true, false)}]`

        content += ' ' + text
        content.trimLeft()

        fs.writeFile(logFile, content, { flag: 'a+' }, (err) => {
            if (echo) process.stdout.write(content)
            if (err) reject(err)
            else resolve(content)
        })
    })
}

function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

async function main() {
    writeLog('\n#####\n', false, false);

    /*
        INIT STATE
    */
    const persistentState = loadStateSync()
    if (persistentState.status) {
        state = persistentState.data
        writeLog('Loaded state from persistent storage\n')
    } else {
        state = defaultState
        writeLog('Loaded state seems invalid/empty, will initialize with empty state instead\n')
    }

    /*
        NODEMAILER SETUP
    */
    let isAuthenticated = false

    let emailTemplateTicket = await new Promise((resolve, reject) => {
        fs.readFile(`${env.APP_MAIL_TEMPLATE_FOLDER}/example.html`, 'utf8', (err, data) => {
            if (err) reject(err)
            resolve(data)
        })
    })

    let transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        pool: env.SMTP_POOL_MODE,
        maxConnections: env.SMTP_POOL_MAX_CONNECTION,
        maxMessages: env.SMTP_POOL_MAX_MESSAGES,
        rateDelta: env.SMTP_POOL_RATE_DELTA,
        rateLimit: env.SMTP_POOL_RATE_LIMIT,
        secure: (env.SMTP_SECURE === 'true'),
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
        }
    })

    transporter.verify((error, success) => {
        if (success) {
            writeLog(`SMTP Authenticated\n`)
            isAuthenticated = true
        } else {
            writeLog(`SMTP Authentication Failed! ${error}\n`)
        }
    })
    
    transporter.on('idle', async () => {
        if (!isAuthenticated) return

        while (transporter.isIdle() && state.queue.length > 0) {
            if (stateLocked) {
                writeLog(`State is being modified by external request. Please wait...\n`)
                continue;
            }

            writeLog(`Sending to: ${state.queue[0].email}\n`)
            
            let renderedEmail = mustache.render(emailTemplateTicket, state.queue[0])
            let subject = "E-Ticket | My Awesome Event"

            let info = await transporter.sendMail({
                from: env.SMTP_EMAIL_FROM,
                to: state.queue[0].email,
                subject: subject,
                html: renderedEmail
            })
            
            writeLog(`Done! ${state.queue[0].email}: ${info.response}\n`)
            state.finished.push(state.queue[0])
            state.queue.shift()
        }
    })

    
    /*
        EXPRESSJS SETUP
    */
    app.use(express.json({ limit: '50mb' }))
    app.use(express.urlencoded({ limit: '50mb', extended: true }))

    app.get(env.EXPRESS_ROOT_ROUTE, (req, res) => {
        res.json(state)
    })

    app.delete(`${env.EXPRESS_ROOT_ROUTE}delete/:email`, async (req, res) => {
        // Lock current state from being processed
        stateLocked = true

        let email = req.params.email

        // Runs the modification
        state.finished = await state.finished.filter((value) => {
            return (value.email != email)
        })
        state.queue = await state.finished.filter((value) => {
            return (value.email != email)
        })

        // Release the lock
        stateLocked = false

        res.json({ status: true })
    })
    
    app.post(`${env.EXPRESS_ROOT_ROUTE}queue/push`, (req, res) => {
        const listOfNewEmail = req.body
        const newMailQueued = []
    
        if (Array.isArray(listOfNewEmail)) {
            listOfNewEmail.forEach((item) => {
                if (validateEmail(item.email)) {
                    state.queue.push(item)
                    newMailQueued.push(item)
                } else {
                    writeLog(`${item.email} is not valid. Skipping...\n`)
                }
            })

            if (newMailQueued.length > 0) {
                writeLog(`${newMailQueued.length} new email(s) added to queue!\n`).then(() => {
                    if (transporter.isIdle() && state.queue.length > 0) {
                        transporter.emit('idle')
                    }
                })
            }
        }
        
        res.json(newMailQueued)
    })
    
    app.listen(port, () => {
        writeLog(`Service started. Running on port ${port}\n`)
    })

    process.stdin.resume();
    const appInterrupts = [`SIGINT`, `SIGTERM`, `exit`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`].forEach(signal => {
        process.on(signal, async () => {
            await writeLog("Service shutdown, saving state...\n")
            saveStateSync(state)
            process.exit()
        })
    })
}

main().catch(console.error)
