import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createNodeWebSocket } from '@hono/node-ws'
import { spawn } from 'node:child_process'
import path from 'path'
import { getConnInfo } from '@hono/node-server/conninfo'
import { getIP, getIPs, updateOrCreateIP, type IPModel } from './db/ips.js'
import { getHit, updateOrCreateHit } from './db/hits.js'
import type { SendOptions } from 'hono/ws'

// test db - sync up changes with docker compose in development
// updateOrCreateHit("123.123.123.123", {
//   ip: "123.123.123.123",
//   count: 19
// })

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// const getServerIP = async () => {
//   const serverIP = await (await fetch(`https://api.my-ip.io/v2/ip.json`)).json()
//   return serverIP.ip
// }

app.get('/', async (c) => {
  // return c.text('Hello Hono!')
  return c.text(`Hi! Your IP is ${getConnInfo(c).remote.address}`)
  // return c.text(`Hi! Server IP is ${getServerIP()}`)
})
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onOpen(event, ws) {
        console.log('Connection opened')
        // ws.send("data coming!")
      },
      async onMessage(event, ws) {
        console.log(`Message from dashboard: ${event.data}`)
        if (event.data !== 'init') {
          ws.send('Bye.')
          return
        }
        // ws.send('Hello from api!')
        const serverName = process.env.SERVER_NAME || 'Auth Log Map'
        const serverInfo = {
          lat: Number(process.env.GEO_COORDS!.split('//')[0]),
          lng: Number(process.env.GEO_COORDS!.split('//')[1]),
        }
        const ips = await getIPs()
        ws.send(
          JSON.stringify({
            serverName,
            serverInfo,
            ips,
          }),
        )

        // const fileLog = "/var/log/auth.log"
        const fileLog = process.env.LOG_FILE! || '/var/log/auth.log'
        console.log(`Listening on file: ${path.resolve(fileLog)}`)
        // const tail = spawn(`tail -f ${fileLog}`)
        const tail = spawn('tail', ['-n 10000', '-f', fileLog])
        tail.stdout.on('data', async (data) => {
          // console.log(`Sending data to dashboard: ${data}`)
          // ws.send('DATAAAAAAAAA')
          const logLines = Buffer.from(data).toString().split('\n')
          const stringified = await analyzeLogs(logLines, ws.send)
          console.log('Stringified data: ', stringified)
          ws.send(stringified)
        })
      },
      onClose: () => {
        console.log('Connection closed')
      },
    }
  }),
)

async function analyzeLogs(
  logs: string[],
  send: {
    (source: string | ArrayBuffer | Uint8Array, options?: SendOptions): void
    (arg0: string): void
  },
) {
  const logsResult: {
    events: any[]
  } = {
    events: [],
  }
  for (const log of logs) {
    const { eventName, context } = parseLog(log)
    // console.log('INFO: ', eventName, context)
    if (context && Object.hasOwn(context ?? {}, 'ip_address')) {
      try {
        const ipInfos = await prepareAndStoreInfos(context.ip_address)
        logsResult.events.push({
          eventName,
          context,
          ipInfos,
          // endLocation: {
          //   lat: Number(process.env.GEO_COORDS!.split('//')[0]),
          //   lng: Number(process.env.GEO_COORDS!.split('//')[1]),
          // },
        })
        send(JSON.stringify(logsResult))
      } catch (error) {
        console.log('Error, skipping ip: ', context.ip_address)
      }
    }
  }
  return JSON.stringify(logsResult)
}

async function prepareAndStoreInfos(ip: string) {
  const ipDb = await getIP(ip)
  const hitDb = await getHit(ip)
  const hitSaved = await updateOrCreateHit(ip, {
    ip,
    count: hitDb?.count ? hitDb.count + 1 : 1,
  })
  if (ipDb) {
    return {
      ip: ipDb,
      hit: hitSaved,
    }
  }

  let ipRemote

  try {
    ipRemote = await getRemoteIPInfoFromGETGEOAPICOM(ip)
  } catch (errorGETGEOAPICOM) {
    console.log('error on GETGEOAPICOM: ', errorGETGEOAPICOM)
    try {
      ipRemote = await getRemoteIPInfoFromIPWHOIS(ip)
    } catch (errorIPWHOIS) {
      console.log('error on IPWHOIS: ', errorIPWHOIS)
      try {
        ipRemote = await getRemoteIPInfoFromIPAPICO(ip)
      } catch (errorIPAPICO) {
        console.log('error on IPAPICO: ', errorIPAPICO)
      }
    }
  }

  if (!ipRemote) throw new Error('Could not retrieve IP infos from apis.')

  const ipSaved = await updateOrCreateIP(ip, ipRemote)

  return {
    ip: ipSaved,
    hit: hitSaved,
  }
}

async function getRemoteIPInfoFromGETGEOAPICOM(ip: string): Promise<IPModel> {
  const ipRes = await (
    await fetch(
      `https://api.getgeoapi.com/v2/ip/${ip}?api_key=${process.env.GEO_API_KEY}&format=json`,
    )
  ).json()
  if (ipRes.status !== 'success') throw new Error(ipRes.error.message)
  return {
    ip,
    continent_code: ipRes.continent?.code,
    country_code: ipRes.country?.code,
    city: ipRes.city?.name,
    lat: ipRes.location?.latitude,
    lng: ipRes.location?.longitude,
    isp: ipRes.asn?.organisation,
  }
}
async function getRemoteIPInfoFromIPAPICO(ip: string): Promise<IPModel> {
  const ipRes = await (await fetch(`https://ipapi.co/${ip}/json`)).json()
  if (!ipRes.success) throw new Error(ipRes.message)
  return {
    ip,
    continent_code: ipRes.continent_code,
    country_code: ipRes.country_code,
    city: ipRes.city,
    lat: ipRes.latitude,
    lng: ipRes.longitude,
    isp: ipRes.org,
  }
}
async function getRemoteIPInfoFromIPWHOIS(ip: string): Promise<IPModel> {
  const ipRes = await (await fetch(`https://ipwho.is/${ip}`)).json()
  if (!ipRes.success) throw new Error(ipRes.message)
  return {
    ip,
    continent_code: ipRes.continent_code,
    country_code: ipRes.country_code,
    city: ipRes.city,
    lat: ipRes.latitude,
    lng: ipRes.longitude,
    isp: ipRes.connection.isp,
  }
}

function parseLog(log: string) {
  let eventName, context
  if (log.includes('Failed password')) {
    eventName = 'failed password'
    context =
      /Failed password for (invalid user )?(?<username>\w+) from (?<ip_address>[\d.]+) port (?<port>\d+) (?<protocol>\w+)/.exec(
        log,
      )?.groups
  } else if (log.includes('Invalid user')) {
    eventName = 'invalid user'
    context =
      /Invalid user (?<username>\w+) from (?<ip_address>[\d.]+) port (?<port>\d+)/.exec(
        log,
      )?.groups
  } else if (log.includes('Accepted')) {
    eventName = 'successful login'
    context =
      /Accepted (?<auth_method>\w+) for (?<username>\w+) from (?<ip_address>[\d.]+) port (?<port>\d+) (?<protocol>\w+)(: )?(?<ssh_signature>RSA SHA256:[A-Za-z0-9+/=]+)?/.exec(
        log,
      )?.groups
  } else if (log.includes('Received disconnect')) {
    eventName = 'disconnect user'
    context =
      /Received disconnect from (?<ip_address>[\d.]+)(?: port (?<port>\d+))?:(?<error_code>\d+):.*\[(?<stage>\w+)\]/.exec(
        log,
      )?.groups
  } else if (log.includes('Disconnected')) {
    eventName = 'disconnect user'
    context =
      /Disconnected from (invalid |authenticating )?user (?<username>\w+) (?<ip_address>[\d.]+) port (?<port>\d+) \[(?<stage>\w+)\]/.exec(
        log,
      )?.groups
  } else if (log.includes('session opened for user')) {
    eventName = 'session opened'
    context =
      /pam_unix\((?<service>\S+):(?<pam_activity>\S+)\): session opened for user (?<sudo_user>\S+)\(uid=(?<sudo_user_id>\d+)\) by (?<username>\S+)?\(uid=(?<user_id>\d+)\)/.exec(
        log,
      )?.groups
  } else if (log.includes('session closed for user')) {
    eventName = 'session closed'
    context =
      /pam_unix\((?<service>\S+):(?<pam_activity>\S+)\): session closed for user (?<sudo_user>\S+)/.exec(
        log,
      )?.groups
  } else if (log.includes('TTY=')) {
    eventName = 'sudo command'
    context =
      /(?<username>\S+) : ((?<error>.*?) ; )?TTY=(?<tty>\S+) ; PWD=(?<pwd>\S+) ; USER=(?<sudo_user>\S+) ;( COMMAND=(?<command>.+))?/.exec(
        log,
      )?.groups
  } else if (log.includes('authentication failure')) {
    eventName = 'sudo authentication failure'
    context =
      /pam_unix\((?<service>\S+):(?<pam_activity>\S+)\): (?<error>.*?); ?logname=(?<logname>.*?) ?uid=(?<uid>\d+) ?euid=(?<euid>\d+) ?tty=(?<tty>\S+) ?ruser=(?<ruser>.*?) ?rhost=(?<rhost>.*?)( user=(?<user>\w+))?/.exec(
        log,
      )?.groups
  }
  return {
    eventName,
    context,
  }
}

const port = 3000
console.log(`Server is running on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port,
})
injectWebSocket(server)
