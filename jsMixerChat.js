ExtendableProxy = class {
  constructor(getset={}) {
    return new Proxy(this, getset);
  }
}

isNode = () => {
  return typeof module !== 'undefined' && module.exports
}

if (isNode()) WebSocket = require('ws')

class MixerChat extends ExtendableProxy {
  constructor(url) {
    super({
      set: (parent, name, value) => {
        if (parent.ws) return parent.ws[name] = value
        return parent[name] = value
      },
      get: (parent, name1) => {
        if (typeof name1 === 'symbol') return parent
        if (parent[name1] != null) return parent[name1]
        if (parent.ws[name1] != null) return parent.ws[name1]
        if (parent.promise[name1] != null) return parent[name1]
        return new Proxy(parent.method(name1), {
          get: (proxy, name2) => {
            if (name2 === 'symbol') return proxy
            return parent.method(`${name1}:${name2}`)
          },
          apply: (proxy, self, args) => {
            return proxy(...args)
          }
        })
      }
    })
    this.promise = (new Promise(() => {}))
    this.eventHandlers = {}
    this.replyHandlers = []
    this.anyEventHandlers = []
    this.ws = new WebSocket(url)
    this.ws.on('message', (message) => {
      let data = JSON.parse(message)
      if (data.type == 'event') {
        this.anyEventHandlers.forEach(async handler => {
          handler(data.event, data.data)
        })
        if (this.eventHandlers[data.event]) {
          this.eventHandlers[data.event].forEach(async handler => {
            handler(data.data)
          })
        }
      } else if (data.type == 'reply') {
        this.replyHandlers.forEach(async handler => {
          if (data.error) handler(data.id, {error: data.error})
          else handler(data.id, data.data)
        })
      }
    })
  }

  addEventHandler(event, func) {
    if (typeof event === 'function') {
      this.anyEventHandlers.push(event)
    } else if (typeof event === 'string' && typeof func === 'function') {
      if (!this.eventHandlers[event]) this.eventHandlers[event] = []
      this.eventHandlers[event].push(func)
    } else {
      throw new TypeError('Invalid type for event handler, expected (string, function) or (function)')
    }
  }

  deleteEventHandler(event, func) {
    if (typeof event === 'function') {
      this.anyEventHandlers.filter(f => f != event)
    } else if (typeof event === 'string' && typeof func === 'function') {
      if (!this.eventHandlers[event]) this.eventHandlers[event] = []
      this.eventHandlers[event].filter(f => f != func)
    } else {
      throw new TypeError('Invalid type for event handler, expected (string, function) or (function)')
    }
  }

  addReplyHandler(func) {
    if (typeof func === 'function') {
      this.replyHandlers.push(func)
    } else {
      throw new TypeError('Invalid type for reply handler, expected (function)')
    }
  }

  deleteReplyHandler(func) {
    if (typeof func === 'function') {
      this.replyHandlers.filter(f => f != func)
    } else {
      throw new TypeError('Invalid type for reply handler, expected (function)')
    }
  }

  addMessageHandler(func) {
    this.addEventHandler('ChatMessage', func)
  }

  deleteMessageHandler(func) {
    this.deleteEventHandler('ChatMessage', func)
  }

  method(method) {
    return (...params) => new Promise((resolve, reject) => {
      let id = (new Date).getTime()
      let data = {
        type: `method`,
        method: method,
        arguments: params,
        id: id
      }
      this.ws.send(JSON.stringify(data))
      let handler = (rid, data) => {
        if (rid == id) {
          this.deleteReplyHandler(handler)
          if (data.error) return reject(data)
          else return resolve(data)
        }
      }
      this.addReplyHandler(handler)
    })
  }
}

if (isNode()) {
  module.exports = MixerChat
}