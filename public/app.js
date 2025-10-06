// Variables globales
let ws = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let localStream = null;
let peerConnections = new Map(); // Mapa de conexiones peer (viewerId -> RTCPeerConnection)
let currentRoomId = null;
let isBroadcaster = false;
let viewerId = null;

// Configuración de servidores ICE (STUN)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

// Conectar al servidor WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ Conectado al servidor WebSocket');
        reconnectAttempts = 0;
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        // Si es broadcaster y estaba transmitiendo, recrear sala
        if (isBroadcaster && currentRoomId && localStream) {
            ws.send(JSON.stringify({
                type: 'create-room',
                roomId: currentRoomId
            }));
        }
        // Si es viewer y estaba en sala, volver a unirse
        if (!isBroadcaster && currentRoomId && viewerId) {
            ws.send(JSON.stringify({
                type: 'join-room',
                roomId: currentRoomId,
                viewerId: viewerId
            }));
        }
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('📩 Mensaje recibido:', data.type);

        switch(data.type) {
            case 'room-created':
                handleRoomCreated(data);
                break;
            case 'joined-room':
                handleJoinedRoom(data);
                break;
            case 'viewer-joined':
                handleViewerJoined(data);
                break;
            case 'viewer-left':
                handleViewerLeft(data);
                break;
            case 'offer':
                handleOffer(data);
                break;
            case 'answer':
                handleAnswer(data);
                break;
            case 'ice-candidate':
                handleIceCandidate(data);
                break;
            case 'broadcaster-left':
                handleBroadcasterLeft();
                break;
            case 'error':
                alert(data.message);
                break;
        }
    };

    ws.onerror = (error) => {
        console.error('❌ Error de WebSocket:', error);
    };

    ws.onclose = () => {
        console.log('🔌 Desconectado del servidor');
        // Intentar reconectar automáticamente
        if (reconnectAttempts < 10) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 15000); // backoff exponencial
            reconnectAttempts++;
            console.log(`🔄 Reintentando conexión en ${delay / 1000}s...`);
            reconnectTimeout = setTimeout(() => {
                connectWebSocket();
            }, delay);
        } else {
            alert('No se pudo reconectar al servidor. Intenta recargar la página.');
        }
    };
}

// Generar ID aleatorio
// Generar código de sala de 3 dígitos numéricos
function generateRoomId() {
    return Math.floor(100 + Math.random() * 900).toString();
}

// Iniciar transmisión
async function startBroadcasting() {
    try {
        // Solicitar captura de pantalla
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            },
            audio: false
        });
        
        // Mostrar el video local
        document.getElementById('localVideo').srcObject = localStream;
        
        // Generar ID de sala
        currentRoomId = generateRoomId();
        isBroadcaster = true;

        // Conectar al servidor
        connectWebSocket();

        // Esperar a que la conexión esté abierta
        await waitForWebSocket();

        // Crear la sala
        ws.send(JSON.stringify({
            type: 'create-room',
            roomId: currentRoomId
        }));

        // Detectar cuando se detiene la transmisión
        localStream.getVideoTracks()[0].onended = () => {
            stopBroadcasting();
        };

        // Cambiar a pantalla de broadcaster
        showScreen('broadcasterScreen');

        // Mostrar QR con el link de la transmisión
        setTimeout(() => {
            const shareUrl = `${window.location.origin}?room=${currentRoomId}`;
            let qrContainer = document.getElementById('qrContainer');
            if (!qrContainer) {
                qrContainer = document.createElement('div');
                qrContainer.id = 'qrContainer';
                qrContainer.className = 'flex flex-col items-center justify-center mt-4';
                document.getElementById('shareInfo').appendChild(qrContainer);
            } else {
                qrContainer.innerHTML = '';
            }
            const qr = generateQRCode(shareUrl, 180);
            qrContainer.appendChild(qr);
            const qrLabel = document.createElement('div');
            qrLabel.className = 'text-purple-300 text-xs mt-2';
            qrLabel.textContent = 'Escanea para unirte a la transmisión';
            qrContainer.appendChild(qrLabel);
        }, 500);

    } catch (error) {
        console.error('❌ Error al iniciar transmisión:', error);
        alert('No se pudo acceder a la pantalla. Asegúrate de dar permisos.');
    }
}

// Esperar a que WebSocket esté conectado
function waitForWebSocket() {
    return new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN) {
            resolve();
        } else {
            ws.addEventListener('open', resolve, { once: true });
        }
    });
}

// Manejar sala creada
function handleRoomCreated(data) {
    currentRoomId = data.roomId;
    document.getElementById('roomIdDisplay').value = currentRoomId;
    document.getElementById('shareUrl').value = `${window.location.origin}?room=${currentRoomId}`;
    console.log(`🎉 Sala creada: ${currentRoomId}`);
}

// Manejar nuevo viewer
async function handleViewerJoined(data) {
    console.log(`👤 Nuevo viewer: ${data.viewerId}`);
    
    // Actualizar contador
    document.getElementById('viewerCount').textContent = `👥 ${data.count} espectador${data.count !== 1 ? 'es' : ''}`;
    
    // Crear conexión peer para este viewer
    const pc = new RTCPeerConnection(iceServers);
    peerConnections.set(data.viewerId, pc);
    
    // Agregar el stream local a la conexión
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });
    
    // Manejar candidatos ICE
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
                target: data.viewerId
            }));
        }
    };
    
    // Crear oferta
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // Enviar oferta al viewer
    ws.send(JSON.stringify({
        type: 'offer',
        offer: offer,
        target: data.viewerId
    }));
}

// Manejar viewer que se fue
function handleViewerLeft(data) {
    console.log(`👋 Viewer salió: ${data.viewerId}`);
    
    // Cerrar y eliminar la conexión peer
    const pc = peerConnections.get(data.viewerId);
    if (pc) {
        pc.close();
        peerConnections.delete(data.viewerId);
    }
    
    // Actualizar contador
    document.getElementById('viewerCount').textContent = `👥 ${data.count} espectador${data.count !== 1 ? 'es' : ''}`;
}

// Detener transmisión
function stopBroadcasting() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Cerrar todas las conexiones peer
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    currentRoomId = null;
    isBroadcaster = false;
    
    showScreen('selectScreen');
}

// Unirse a una sala como viewer
async function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    
    if (!roomCode) {
        alert('Por favor ingresa un código de sala');
        return;
    }
    
    currentRoomId = roomCode;
    isBroadcaster = false;
    viewerId = generateRoomId(); // Generar ID único para este viewer
    
    // Conectar al servidor
    connectWebSocket();
    
    // Esperar a que la conexión esté abierta
    await waitForWebSocket();
    
    // Unirse a la sala
    ws.send(JSON.stringify({
        type: 'join-room',
        roomId: currentRoomId,
        viewerId: viewerId
    }));
    
    showScreen('viewerScreen');
    document.getElementById('viewerRoomId').textContent = `Sala: ${currentRoomId}`;
}

// Manejar que nos unimos a la sala
function handleJoinedRoom(data) {
    console.log('✅ Unido a la sala exitosamente');
    viewerId = data.viewerId;
    
    // Crear conexión peer
    const pc = new RTCPeerConnection(iceServers);
    peerConnections.set('broadcaster', pc);
    
    // Manejar candidatos ICE
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate
            }));
        }
    };
    
    // Recibir el stream remoto
    pc.ontrack = (event) => {
        console.log('📺 Stream recibido');
        document.getElementById('remoteVideo').srcObject = event.streams[0];
    };
}

// Manejar oferta recibida (viewer)
async function handleOffer(data) {
    console.log('📨 Oferta recibida del broadcaster');
    
    const pc = peerConnections.get('broadcaster');
    if (!pc) return;
    
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    // Crear respuesta
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    // Enviar respuesta
    ws.send(JSON.stringify({
        type: 'answer',
        answer: answer
    }));
}

// Manejar respuesta recibida (broadcaster)
async function handleAnswer(data) {
    console.log(`📨 Respuesta recibida del viewer: ${data.from}`);
    
    const pc = peerConnections.get(data.from);
    if (!pc) return;
    
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
}

// Manejar candidato ICE
async function handleIceCandidate(data) {
    console.log('🧊 Candidato ICE recibido');
    
    let pc;
    if (isBroadcaster) {
        pc = peerConnections.get(data.from);
    } else {
        pc = peerConnections.get('broadcaster');
    }
    
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error('Error agregando candidato ICE:', error);
        }
    }
}

// Manejar cuando el broadcaster se va
function handleBroadcasterLeft() {
    alert('El broadcaster ha terminado la transmisión');
    leaveRoom();
}

// Salir de la sala (viewer)
function leaveRoom() {
    // Cerrar conexión peer
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    document.getElementById('remoteVideo').srcObject = null;
    currentRoomId = null;
    viewerId = null;
    
    showScreen('selectScreen');
}

// Copiar código de sala
function copyRoomId() {
    const roomId = document.getElementById('roomIdDisplay').value;
    navigator.clipboard.writeText(roomId);
    showCopyFeedback('Código copiado');
}

// Copiar URL de compartir
function copyShareUrl() {
    const url = document.getElementById('shareUrl').value;
    navigator.clipboard.writeText(url);
    showCopyFeedback('URL copiada');
}

// Mostrar feedback de copiado
function showCopyFeedback(message) {
    // Crear elemento de feedback
    const feedback = document.createElement('div');
    feedback.textContent = `✅ ${message}`;
    feedback.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    document.body.appendChild(feedback);
    
    // Remover después de 2 segundos
    setTimeout(() => {
        feedback.remove();
    }, 2000);
}

// Cambiar entre pantallas
function showScreen(screenId) {
    document.getElementById('selectScreen').classList.add('hidden');
    document.getElementById('broadcasterScreen').classList.add('hidden');
    document.getElementById('viewerScreen').classList.add('hidden');
    
    document.getElementById(screenId).classList.remove('hidden');
}

// Pantalla completa para video
function toggleFullscreen(videoId) {
    const video = document.getElementById(videoId);
    if (!video) return;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) {
            video.msRequestFullscreen();
        }
    }
}

// Verificar si hay un código de sala en la URL al cargar
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get('room');
    
    if (urlRoomId) {
        document.getElementById('roomCodeInput').value = urlRoomId.toUpperCase();
        // Opcional: unirse automáticamente
        // joinRoom();
    }
});