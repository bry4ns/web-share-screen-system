const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir archivos estáticos
app.use(express.static('public'));

// Almacenar salas y conexiones
const rooms = new Map();

wss.on('connection', (ws) => {
  console.log('Nueva conexión WebSocket');
  
  let currentRoom = null;
  let isBroadcaster = false;
  let viewerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Mensaje recibido:', data.type);

      switch(data.type) {
        case 'create-room':
          currentRoom = data.roomId;
          isBroadcaster = true;
          
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, {
              broadcaster: ws,
              viewers: new Map()
            });
            console.log(`Sala creada: ${currentRoom}`);
          }
          
          ws.send(JSON.stringify({ 
            type: 'room-created', 
            roomId: currentRoom 
          }));
          break;

        case 'join-room':
          currentRoom = data.roomId;
          viewerId = data.viewerId || generateId();
          
          if (rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            room.viewers.set(viewerId, ws);
            
            console.log(`Viewer ${viewerId} se unió a la sala ${currentRoom}`);
            
            // Notificar al broadcaster sobre el nuevo viewer
            room.broadcaster.send(JSON.stringify({
              type: 'viewer-joined',
              viewerId: viewerId,
              count: room.viewers.size
            }));
            
            // Confirmar al viewer que se unió
            ws.send(JSON.stringify({ 
              type: 'joined-room',
              viewerId: viewerId
            }));
          } else {
            ws.send(JSON.stringify({ 
              type: 'error',
              message: 'Sala no encontrada'
            }));
          }
          break;

        case 'offer':
          // El broadcaster envía una oferta a un viewer específico
          if (rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            const targetViewer = room.viewers.get(data.target);
            
            if (targetViewer) {
              targetViewer.send(JSON.stringify({
                type: 'offer',
                offer: data.offer,
                from: 'broadcaster'
              }));
            }
          }
          break;

        case 'answer':
          // Un viewer responde al broadcaster
          if (rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            room.broadcaster.send(JSON.stringify({
              type: 'answer',
              answer: data.answer,
              from: viewerId
            }));
          }
          break;

        case 'ice-candidate':
          // Intercambiar candidatos ICE
          if (rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            
            if (isBroadcaster && data.target) {
              // Broadcaster envía ICE a un viewer específico
              const targetViewer = room.viewers.get(data.target);
              if (targetViewer) {
                targetViewer.send(JSON.stringify({
                  type: 'ice-candidate',
                  candidate: data.candidate,
                  from: 'broadcaster'
                }));
              }
            } else if (!isBroadcaster) {
              // Viewer envía ICE al broadcaster
              room.broadcaster.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: data.candidate,
                from: viewerId
              }));
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  });

  ws.on('close', () => {
    console.log('Conexión cerrada');
    
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      
      if (isBroadcaster) {
        console.log(`Broadcaster cerró la sala ${currentRoom}`);
        // Notificar a todos los viewers que la sala se cerró
        room.viewers.forEach((viewer) => {
          viewer.send(JSON.stringify({
            type: 'broadcaster-left'
          }));
          viewer.close();
        });
        rooms.delete(currentRoom);
      } else if (viewerId) {
        console.log(`Viewer ${viewerId} salió de la sala ${currentRoom}`);
        room.viewers.delete(viewerId);
        
        // Notificar al broadcaster
        if (room.broadcaster.readyState === WebSocket.OPEN) {
          room.broadcaster.send(JSON.stringify({
            type: 'viewer-left',
            viewerId: viewerId,
            count: room.viewers.size
          }));
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Ruta de salud para verificar que el servidor está corriendo
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📡 WebSocket listo para conexiones`);
  console.log(`🏥 Health check disponible en http://localhost:${PORT}/health`);
});