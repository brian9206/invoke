import { executionClient, buildGatewayHeaders, buildInvokeUrl } from './execution-client'

/**
 * Invoke a function for a realtime socket event.
 * The function receives the event details via special x-realtime-socket-* headers
 * and the event data in the request body.
 */
export async function invokeRealtimeSocketFunction(
  functionId: string,
  socketId: string,
  namespacePath: string,
  socketRooms: string[],
  handshake: Record<string, any>,
  eventName: string,
  eventData: unknown[],
  clientIp = ''
): Promise<void> {
  const headers = buildGatewayHeaders(clientIp, {
    'x-realtime-socket-event': eventName,
    'x-realtime-socket-id': socketId,
    'x-realtime-socket-namespace': namespacePath,
    'x-realtime-socket-rooms': JSON.stringify(socketRooms),
    'x-realtime-socket-handshake': JSON.stringify(handshake),
    'content-type': 'application/json'
  })

  const url = buildInvokeUrl(functionId, '/socket.io')

  await executionClient.post(url, JSON.stringify(eventData), { headers })
}
