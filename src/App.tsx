import { useEffect, useRef, useState } from 'react'
import Globe, { GlobeMethods } from 'react-globe.gl'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import * as THREE from 'three'

import countries from '../custom.geo.json'

interface LogEvents {
  events: {
    eventName: string
    context: any
    ipInfos: {
      ip: {
        ip: string
        continent_code: string
        country_code: string
        city: string
        lat: string | number
        lng: string | number
        isp: string
      }
      hit: Record<
        string,
        {
          ip: string
          count: number
        }
      >
    }
  }[]
}

interface LogInit {
  serverName: string
  serverInfo: {
    lat: number
    lng: number
  }
  ips: Record<
    string,
    {
      ip: string
      continent_code: string
      country_code: string
      city: string
      lat: string | number
      lng: string | number
      isp: string
    }
  >
}

function App() {
  const WS_URL = (window as any).envConfig.WS_URL //|| "ws://127.0.0.1:3000/ws"
  const { sendMessage, lastJsonMessage, readyState } = useWebSocket<
    LogEvents | LogInit | undefined
  >(WS_URL, {
    share: false,
    shouldReconnect: () => true,
  })
  const globeRef = useRef<GlobeMethods>(undefined)
  const globeReady = () => {
    if (globeRef.current) {
      // globeRef.current.controls().autoRotate = true;
      // globeRef.current.controls().enableZoom = false;

      globeRef.current.pointOfView({
        lat: 49.4609,
        lng: 11.0618,
        altitude: 1.8,
      })
    }
  }
  // const [ globeMat, setGlobeMat ] = useState<THREE.MeshPhongMaterial | undefined>()
  const [ipData, setIpData] = useState<Record<string, any[]>>()
  const [serverRing, setServerRing] = useState<
    | {
        lat: number
        lng: number
        text: string
        color: string
      }
    | undefined
  >()
  // const connectionStatus = {
  //   [ReadyState.CONNECTING]: 'Connecting',
  //   [ReadyState.OPEN]: 'Open',
  //   [ReadyState.CLOSING]: 'Closing',
  //   [ReadyState.CLOSED]: 'Closed',
  //   [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  // }[readyState];

  const [init, setInit] = useState<boolean>(false)
  // Run when the connection state (readyState) changes
  useEffect(() => {
    console.log('Connection state changed')
    if (readyState === ReadyState.OPEN) {
      !init && sendMessage('init')
      // init && sendMessage('continue')
      setInit(true)
    }
  }, [readyState])

  // Run when a new WebSocket message is received (lastJsonMessage)
  useEffect(() => {
    if (lastJsonMessage && lastJsonMessage.hasOwnProperty('serverName')) {
      const { serverInfo, serverName, ips } = lastJsonMessage as LogInit
      setServerRing({
        lat: serverInfo.lat,
        lng: serverInfo.lng,
        text: serverName,
        color: 'rgb(10, 200, 67)',
      })
      setIpData({
        ...(ipData ?? {}),
        ...Object.values(ips).reduce(
          (acc, data) => ({
            ...acc,
            [data.ip]: {
              startLat: data.lat,
              startLng: data.lng,
              endLat: serverInfo.lat,
              endLng: serverInfo.lng,
              lat: data.lat,
              lng: data.lng,
              text: `${data.continent_code}/${data.country_code} ${data.ip}`,
              color: 'rgba(255, 42, 0, 1)',
              pointRadius: 0.3,
              arcColor: ['#ffff00', '#ff0000'],
              arcStroke: 0.5,
              // arcAltitude: 0.5,
              arcDashLength: 0.03,
              arcDashGap: 0.03,
              arcDashAnimateTime: 10000,
              // resolution: 2,
              // dotRadius: 0.1
            },
          }),
          {},
        ),
      })
      return
    }

    const messageEvents: LogEvents = lastJsonMessage as LogEvents
    // console.log(`Got a new message: ${JSON.stringify(messageEvents)}`)
    // console.log('Got a new message json: ', messageEvents)
    if (!messageEvents) return
    // const promises = messageEvents?.events?.map((ev: any) => {

    const eventsToIPs = [
      ...new Map(
        messageEvents?.events?.map((ip) => [ip.context.ip_address, ip]),
      )?.values(),
    ]

    // const promises = eventsToIPs.map((ev: any) => {
    //   return fetch(`https://ipwho.is/${ev.context.ip_address}`).then((res) => res.json())
    // }) || []
    // const ips = await Promise.all(promises)
    // const newIpData = ips ? Array.from((new Map(ips.map(ip => [ip.query, ip])))).map((res: any) => ({
    //     lat: res.lat,
    //     lng: res.lon,
    //     text: `${res.query}-${res.asname}-${res.country}`
    //   })) : []
    // const newIpData = [...(new Map(ips?.map(ip => [ip.query, ip])))?.values()].map((res: any) => ({
    const newIpData = eventsToIPs?.reduce(
      (acc, data) => ({
        ...acc,
        [data.ipInfos.ip.ip]: {
          startLat: data.ipInfos.ip.lat,
          startLng: data.ipInfos.ip.lng,
          endLat: serverRing?.lat,
          endLng: serverRing?.lng,
          lat: data.ipInfos.ip.lat,
          lng: data.ipInfos.ip.lng,
          text: `${data.ipInfos.ip.continent_code}/${data.ipInfos.ip.country_code} ${data.ipInfos.ip.ip}`,
          color: 'rgba(255, 42, 0, 1)',
          pointRadius: 0.3,
          arcColor: ['#ffff00', '#ff0000'],
          arcStroke: 0.5,
          // arcAltitude: 0.5,
          arcDashLength: 0.03,
          arcDashGap: 0.03,
          arcDashAnimateTime: 10000,
          // resolution: 2,
          // dotRadius: 0.1
        },
      }),
      {},
    )
    setIpData({
      ...(ipData ?? {}),
      ...newIpData,
    })
    console.log('newIpData == ', newIpData)
    console.log('ipData == ', ipData)
  }, [lastJsonMessage])

  const globeMat = new THREE.MeshPhongMaterial() // (new ThreeGlobe()).globeMaterial().clone() as THREE.MeshPhongMaterial
  globeMat.color = new THREE.Color(0x3a228a)
  globeMat.emissive = new THREE.Color(0x220038)
  globeMat.emissiveIntensity = 0.1
  globeMat.shininess = 0.7
  globeMat.opacity = 0.95
  globeMat.transparent = true

  const myData = [
    {
      startLat: 29.953204744601763,
      startLng: -90.08925929478903,
      endLat: 28.621322361013092,
      endLng: 77.20347613099612,
      color: ['#00ff33', '#ff0000'],
      stroke: 1,
      gap: 0.02,
      dash: 0.02,
      scale: 0.3,
      time: 2000,
    },
    {
      startLat: 28.621322361013092,
      startLng: 77.20347613099612,
      endLat: -43.1571459086602,
      endLng: 172.72338919659848,
      color: ['#ff0000', '#ffff00'],
      stroke: 3,
      gap: 0.05,
      dash: 0.3,
      scale: 0.5,
      time: 8000,
    },
  ]

  return (
    <Globe
      ref={globeRef}
      onGlobeReady={globeReady}
      backgroundColor="#08070e"
      rendererConfig={{ antialias: true, alpha: true }}
      globeMaterial={
        new THREE.MeshPhongMaterial({
          color: '#1a2033',
          opacity: 0.95,
          transparent: true,
        })
      }
      // globeMaterial={globeMat}
      hexPolygonsData={countries.features}
      hexPolygonResolution={3}
      hexPolygonMargin={0.7}
      showAtmosphere={true}
      atmosphereColor="#3a228a"
      atmosphereAltitude={0.25}
      // globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      // pointsData={gData}
      // pointAltitude="size"
      // pointColor="color"

      pointsData={Object.values(ipData || {})}
      pointColor={'color'}
      pointRadius={'pointRadius'}
      pointAltitude={0.003}
      // labelsData={Object.values(ipData || {})}
      // labelColor={'color'}
      // labelSize={1}
      // labelDotRadius={'size'}

      // ringsData={[{
      //   lat: 49.4609,
      //   lng: 11.0618,
      //   text: "TITAN-SERVER",
      //   color: "rgb(10, 200, 67)",
      //   size: 3,
      //   speed: 10
      // }]}
      ringsData={[{ ...serverRing }]}
      ringLat={(d: any) => d.lat}
      ringLng={(d: any) => d.lng}
      ringColor={'color'}
      ringMaxRadius={4}
      ringRepeatPeriod={300}
      ringResolution={5}
      // ringPropagationSpeed={2}
      // ringAltitude={0}

      // arcsData={[{
      //   startLat: 31.7762,
      //   startLng: 118.842,
      //   endLat: 49.4609,
      //   endLng: 11.0618,
      //   text: "TITAN-SERVER",
      //   arcColor: ['#ffff00', '#ff0000'],
      //   arcStroke: 0.5,
      //   arcAltitude: 0.3,
      //   arcDashLength: 0.03,
      //   arcDashGap: 0.03,
      //   arcDashAnimateTime: 3000,
      // }]}

      arcsData={Object.values(ipData || {})}
      arcColor={'arcColor'}
      // arcStroke={'arcStroke'}
      // arcAltitude={'arcAltitude'}
      arcDashLength={'arcDashLength'}
      arcDashGap={'arcDashGap'}
      // arcCircularResolution={2}
      arcDashAnimateTime={'arcDashAnimateTime'}
      arcsTransitionDuration={0}
    />
  )
}

export default App
