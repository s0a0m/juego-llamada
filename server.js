const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Estructura para manejar salas independientes
let rooms = {};

io.on('connection', (socket) => {
  socket.on('join_room', (roomName) => {
    socket.join(roomName);

    if (!rooms[roomName]) {
      rooms[roomName] = {
        roundActive: false,
        firstPressBy: null,
        timeoutId: null,
        restartVotes: new Set()
      };
    }
  });

  socket.on('press_button', ({ room, user }) => {
    let game = rooms[room];
    if (!game) return;

    if (!game.roundActive) {
      // Empieza la ronda
      game.roundActive = true;
      game.firstPressBy = user;
      game.restartVotes.clear(); // Limpiar votos de reinicios anteriores

      // Avisar a todos que alguien presionó y mandar timestamp exacto del inicio
      const startTime = Date.now();
      io.to(room).emit('player_pressed', { first: user, startTime: startTime });

      // El servidor mantiene el timeout de seguridad por si se corta la conexión
      game.timeoutId = setTimeout(() => {
        if (game.roundActive) {
          io.to(room).emit('game_over', { winner: user, reason: 'timeout' });
          game.roundActive = false;
        }
      }, 2000);
    } else {
      // Segundo jugador presionó dentro del tiempo
      if (user !== game.firstPressBy) {
        clearTimeout(game.timeoutId);
        io.to(room).emit('round_saved', { user2: user });
        game.roundActive = false;
        game.firstPressBy = null;
      }
    }
  });

  // Lógica de confirmación mutua para reiniciar cuando alguien pierde
  socket.on('vote_restart', ({ room, user }) => {
    let game = rooms[room];
    if (!game) return;

    game.restartVotes.add(user);

    // Avisar a la sala quién quiere reiniciar
    io.to(room).emit('restart_status', { voted: Array.from(game.restartVotes) });

    // Si están los votos de ambos (mínimo 2 jugadores)
    if (game.restartVotes.size >= 2) {
      game.restartVotes.clear();
      game.roundActive = false;
      game.firstPressBy = null;
      io.to(room).emit('game_restarted');
    }
  });

  socket.on('disconnect', () => {
    // Limpieza básica si se desconectan se podría agregar aquí
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
