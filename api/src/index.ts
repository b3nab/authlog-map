import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createNodeWebSocket } from '@hono/node-ws'
import { getConnInfo } from '@hono/node-server/conninfo'
import { spawn, spawnSync } from 'node:child_process'
import path from 'path'

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

const getServerIP = async () => {
  const serverIP = await (await fetch(`https://api.my-ip.io/v2/ip.json`)).json()
  return serverIP.ip
}

app.get('/', async (c) => {
  // return c.text('Hello Hono!')
  return c.text(`Hi! Your IP is ${getServerIP()}`)
})
app.get('/ws', upgradeWebSocket((c) => {
  return {
    onOpen(event, ws) {
      console.log('Connection opened')
      // ws.send("data coming!")

      // const fileLog = "/var/log/auth.log"
      const fileLog = process.env.LOG_FILE! || "./auth-log"
      console.log(`Listening on file: ${path.resolve(fileLog)}`)
      // const tail = spawn(`tail -f ${fileLog}`)
      const tail = spawn('tail', ['-f', fileLog])
      tail.stdout.on("data", (data) => {
        console.log(`Sending data to dashboard: ${data}`)
        // ws.send('DATAAAAAAAAA')
        const stringified = analyzeLogs((Buffer.from(data)).toString().split('\n'))
        console.log('Stringified data: ', stringified)
        ws.send(stringified)
      })
    },
    onMessage(event, ws) {
      console.log(`Message from dashboard: ${event.data}`)
      ws.send('Hello from api!')
    },
    onClose: () => {
      console.log('Connection closed')
    }
  }
}))

function analyzeLogs(logs: string[]) {
  const logsResult: {
    events: any[]
  } = {
    events: []
  }
  for (const log of logs) {
    const { eventName, context } = parseLog(log)
    console.log('INFO: ', eventName, context)
    if (Object.hasOwn(context ?? {}, 'ip_address')) {
      logsResult.events.push({
        eventName,
        context
      })
    }
  }
  return JSON.stringify(logsResult)
}

function parseLog(log: string) {
  let eventName, context
  if (log.includes("Failed password")) {
    eventName = "failed password"
    context = /Failed password for (invalid user )?(?<username>\w+) from (?<ip_address>[\d.]+) port (?<port>\d+) (?<protocol>\w+)/.exec(log)?.groups
  } else if (log.includes("Invalid user")) {
    eventName = "invalid user"
    context = /Invalid user (?<username>\w+) from (?<ip_address>[\d.]+) port (?<port>\d+)/.exec(log)?.groups
  } else if (log.includes("Accepted")) {
    eventName = "successful login"
    context = /Accepted (?<auth_method>\w+) for (?<username>\w+) from (?<ip_address>[\d.]+) port (?<port>\d+) (?<protocol>\w+)(: )?(?<ssh_signature>RSA SHA256:[A-Za-z0-9+/=]+)?/.exec(log)?.groups
  } else if (log.includes("Received disconnect")) {
    eventName = "disconnect user"
    context = /Received disconnect from (?<ip_address>[\d.]+)(?: port (?<port>\d+))?:(?<error_code>\d+):.*\[(?<stage>\w+)\]/.exec(log)?.groups
  } else if (log.includes("Disconnected")) {
    eventName = "disconnect user"
    context = /Disconnected from (invalid |authenticating )?user (?<username>\w+) (?<ip_address>[\d.]+) port (?<port>\d+) \[(?<stage>\w+)\]/.exec(log)?.groups
  } else if (log.includes("session opened for user")) {
    eventName = "session opened"
    context = /pam_unix\((?<service>\S+):(?<pam_activity>\S+)\): session opened for user (?<sudo_user>\S+)\(uid=(?<sudo_user_id>\d+)\) by (?<username>\S+)?\(uid=(?<user_id>\d+)\)/.exec(log)?.groups
  } else if (log.includes("session closed for user")) {
    eventName = "session closed"
    context = /pam_unix\((?<service>\S+):(?<pam_activity>\S+)\): session closed for user (?<sudo_user>\S+)/.exec(log)?.groups
  } else if (log.includes("TTY=")) {
    eventName = "sudo command"
    context = /(?<username>\S+) : ((?<error>.*?) ; )?TTY=(?<tty>\S+) ; PWD=(?<pwd>\S+) ; USER=(?<sudo_user>\S+) ;( COMMAND=(?<command>.+))?/.exec(log)?.groups
  } else if (log.includes("authentication failure")) {
    eventName = "sudo authentication failure"
    context = /pam_unix\((?<service>\S+):(?<pam_activity>\S+)\): (?<error>.*?); ?logname=(?<logname>.*?) ?uid=(?<uid>\d+) ?euid=(?<euid>\d+) ?tty=(?<tty>\S+) ?ruser=(?<ruser>.*?) ?rhost=(?<rhost>.*?)( user=(?<user>\w+))?/.exec(log)?.groups
  }
  return {
    eventName,
    context
  }
}

const port = 3000
console.log(`Server is running on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})
injectWebSocket(server)