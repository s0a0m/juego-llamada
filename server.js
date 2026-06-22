const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {};

io.on('connection', (socket) => {
  // Ahora pasamos el usuario al unirnos para que el server sepa de entrada quiénes juegan
  socket.on('join_room', ({ room, user }) => {
    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = {
        active: false,
        users: [],
        currentPlayer: null,
        timeoutId: null,
        lastSwitchTime: 0,
        restartVotes: new Set()
      };
    }

    // Agregar al usuario a la lista si no está
    if (!rooms[room].users.includes(user)) {
      rooms[room].users.push(user);
    }

    // Avisar a todos en la sala quiénes están
    io.to(room).emit('room_state', {
      active: rooms[room].active,
      users: rooms[room].users
    });
  });

  socket.on('press_button', ({ room, user }) => {
    let game = rooms[room];
    if (!game) return;

    // Si el juego está corriendo, solo puede apretar el que tiene el turno
    if (game.active && game.currentPlayer !== user) return;

    // Limpiar el temporizador anterior
    clearTimeout(game.timeoutId);
    game.active = true;
    game.restartVotes.clear();

    // El turno pasa al rival (el otro usuario en la sala)
    const rival = game.users.find(u => u !== user);
    if (!rival) return; // Si no hay rival conectado, no hace nada

    game.currentPlayer = rival;
    game.lastSwitchTime = Date.now();

    // Avisar a los navegadores que cambió el turno y se resetea el reloj a 2s
    io.to(room).emit('turn_switched', {
      currentPlayer: game.currentPlayer,
      switchTime: game.lastSwitchTime
    });

    // Iniciar la bomba de tiempo de 2 segundos para el rival
    game.timeoutId = setTimeout(() => {
      game.active = false;
      io.to(room).emit('game_over', { loser: game.currentPlayer });
    }, 2000);
  });

  socket.on('vote_restart', ({ room, user }) => {
    let game = rooms[room];
    if (!game) return;

    game.restartVotes.add(user);
    io.to(room).emit('restart_status', { voted: Array.from(game.restartVotes) });

    if (game.restartVotes.size >= 2) {
      game.restartVotes.clear();
      game.active = false;
      game.currentPlayer = null;
      clearTimeout(game.timeoutId);
      io.to(room).emit('game_restarted');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
