'use strict';

// ─── BroadcastOperator ────────────────────────────────────────────────────────

function BroadcastOperator(namespace, rooms, exceptRooms, socketId) {
  this._namespace = namespace;
  this._rooms = rooms ? rooms.slice() : [];
  this._exceptRooms = exceptRooms ? exceptRooms.slice() : [];
  this._socketId = socketId || null;
}

BroadcastOperator.prototype.to = function (room) {
  return new BroadcastOperator(this._namespace, this._rooms.concat([room]), this._exceptRooms, this._socketId);
};

BroadcastOperator.prototype.in = BroadcastOperator.prototype.to;

BroadcastOperator.prototype.except = function (room) {
  return new BroadcastOperator(this._namespace, this._rooms, this._exceptRooms.concat([room]), this._socketId);
};

BroadcastOperator.prototype.emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var cmd;
  if (this._socketId) {
    // Socket-level broadcast (excludes sender)
    cmd = {
      command: 'broadcast',
      namespace: this._namespace,
      socketId: this._socketId,
      roomIds: this._rooms,
      exceptRooms: this._exceptRooms,
      event: event,
      args: args,
    };
  } else {
    // Namespace-level targeted emit
    cmd = {
      command: 'ns-emit',
      namespace: this._namespace,
      roomIds: this._rooms,
      exceptRooms: this._exceptRooms,
      event: event,
      args: args,
    };
  }
  return _realtimeSocketCommand.applySync(undefined, [JSON.stringify(cmd)], { result: { promise: true } });
};

// ─── SocketProxy ─────────────────────────────────────────────────────────────

function SocketProxy(id, rooms, handshake, namespace) {
  this.id = id;
  this.rooms = new Set(rooms || []);
  this.handshake = handshake || { headers: {}, query: {}, auth: {} };
  this.connected = true;
  this.data = {};
  this.disconnectReason = null;
  this._namespace = namespace;
  this._handlers = {};
}

SocketProxy.prototype._hydrate = function (id, rooms, handshake, namespace, disconnectReason) {
  this.id = id || '';
  this.rooms = new Set(rooms || []);
  this.handshake = handshake || { headers: {}, query: {}, auth: {} };
  this.connected = disconnectReason == null;
  this.disconnectReason = disconnectReason || null;
  this._namespace = namespace || this._namespace || null;
  return this;
};

SocketProxy.prototype.on = function (event, handler) {
  this._handlers[event] = handler;
  return this;
};

SocketProxy.prototype.once = function (event, handler) {
  var self = this;
  var fired = false;
  this._handlers[event] = function () {
    if (!fired) {
      fired = true;
      delete self._handlers[event];
      return handler.apply(this, arguments);
    }
  };
  return this;
};

SocketProxy.prototype.emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  return _realtimeSocketCommand.applySync(undefined, [JSON.stringify({
    command: 'emit',
    namespace: this._namespace,
    socketId: this.id,
    event: event,
    args: args,
  })], { result: { promise: true } });
};

SocketProxy.prototype.join = function (room) {
  return _realtimeSocketCommand.applySync(undefined, [JSON.stringify({
    command: 'join',
    namespace: this._namespace,
    socketId: this.id,
    roomIds: Array.isArray(room) ? room : [room],
  })], { result: { promise: true } });
};

SocketProxy.prototype.leave = function (room) {
  return _realtimeSocketCommand.applySync(undefined, [JSON.stringify({
    command: 'leave',
    namespace: this._namespace,
    socketId: this.id,
    roomIds: Array.isArray(room) ? room : [room],
  })], { result: { promise: true } });
};

SocketProxy.prototype.disconnect = function (close) {
  this.connected = false;
  return _realtimeSocketCommand.applySync(undefined, [JSON.stringify({
    command: 'disconnect',
    namespace: this._namespace,
    socketId: this.id,
    close: close !== false,
  })], { result: { promise: true } });
};

SocketProxy.prototype.to = function (room) {
  return new BroadcastOperator(this._namespace, [room], [], this.id);
};

SocketProxy.prototype.in = SocketProxy.prototype.to;

SocketProxy.prototype.except = function (room) {
  return new BroadcastOperator(this._namespace, [], [room], this.id);
};

Object.defineProperty(SocketProxy.prototype, 'broadcast', {
  get: function () {
    return new BroadcastOperator(this._namespace, [], [], this.id);
  },
});

// ─── RealtimeNamespace ────────────────────────────────────────────────────────

function RealtimeNamespace(namespace) {
  var rs = function (req, res, next) {
    return rs._dispatch(req, res, next);
  };
  Object.setPrototypeOf(rs, RealtimeNamespace.prototype);
  rs._namespace = namespace || null;
  rs.socket = new SocketProxy('', [], { headers: {}, query: {}, auth: {} }, rs._namespace);
  return rs;
}

RealtimeNamespace.prototype.to = function (room) {
  var ns = this._namespace;
  if (!ns) throw new Error('RealtimeNamespace.to() requires an explicit namespace in standalone mode');
  return new BroadcastOperator(ns, [room], [], null);
};

RealtimeNamespace.prototype.in = RealtimeNamespace.prototype.to;

RealtimeNamespace.prototype.except = function (room) {
  var ns = this._namespace;
  if (!ns) throw new Error('RealtimeNamespace.except() requires an explicit namespace in standalone mode');
  return new BroadcastOperator(ns, [], [room], null);
};

RealtimeNamespace.prototype.emit = function (event) {
  var ns = this._namespace;
  if (!ns) throw new Error('RealtimeNamespace.emit() requires an explicit namespace in standalone mode');
  var args = Array.prototype.slice.call(arguments, 1);
  return _realtimeSocketCommand.applySync(undefined, [JSON.stringify({
    command: 'ns-emit',
    namespace: ns,
    event: event,
    args: args,
  })], { result: { promise: true } });
};

['join', 'leave'].forEach(function (method) {
  RealtimeNamespace.prototype[method] = function () {
    throw new Error(method + '() is not available on namespace — use ns.socket.' + method + '() inside an event handler');
  };
});

Object.defineProperty(RealtimeNamespace.prototype, 'broadcast', {
  get: function () {
    throw new Error('broadcast is not available on namespace — use ns.socket.broadcast inside an event handler');
  },
});

RealtimeNamespace.prototype._dispatch = function (req, res, next) {
  var self = this;
  var headers = (req && req.headers) || {};
  var isSocketRequest = (req && req.path) === '/socket.io' && !!headers['x-realtime-socket-event'];

  if (!isSocketRequest) {
    if (typeof next === 'function') {
      return next();
    }
    if (!res.headersSent) {
      res.status(404).json({ success: false, error: 'Invalid usage for RealtimeNamespace' });
    }
    return Promise.resolve();
  }

  var event = headers['x-realtime-socket-event'] || '$connect';
  var socketId = headers['x-realtime-socket-id'] || '';
  var namespace = headers['x-realtime-socket-namespace'] || self._namespace || '';
  var disconnectReason = headers['x-realtime-socket-disconnect-reason'] || null;

  var rooms = [];
  try { rooms = JSON.parse(headers['x-realtime-socket-rooms'] || '[]'); } catch (_) {}

  var handshake = {};
  try { handshake = JSON.parse(headers['x-realtime-socket-handshake'] || '{}'); } catch (_) {}

  var socketProxy = self.socket._hydrate(socketId, rooms, handshake, namespace, disconnectReason);

  function runDispatch() {
    if (event === '$connect') {
      var connectHandler = socketProxy._handlers['$connect'];
      if (connectHandler) return Promise.resolve(connectHandler.call(self));
      return Promise.resolve();
    } else if (event === '$disconnect') {
      var discHandler = socketProxy._handlers['$disconnect'];
      if (discHandler) return Promise.resolve(discHandler.call(self, disconnectReason));
      return Promise.resolve();
    } else {
      var evHandler = socketProxy._handlers[event];
      if (evHandler) {
        var eventArgs = [];
        try {
          var body = req.body;
          if (Array.isArray(body)) {
            eventArgs = body;
          } else if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
            eventArgs = [body];
          } else if (Buffer.isBuffer(body) && body.length > 0) {
            try { eventArgs = [JSON.parse(body.toString())]; } catch (_) { eventArgs = [body.toString()]; }
          }
        } catch (_) {}
        return Promise.resolve(evHandler.apply(self, eventArgs));
      }
      return Promise.reject(new Error('No handler for event "' + event + '"'));
    }
  }

  function finish() {
    return runDispatch().then(function () {
      if (!res.headersSent) res.json({ success: true });
    }).catch(function (err) {
      var msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) res.status(500).json({ success: false, error: msg });
    });
  }

  return finish();
};

module.exports = RealtimeNamespace;
