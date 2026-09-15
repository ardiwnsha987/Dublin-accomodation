import { EventEmitter } from 'events';

export const events = new EventEmitter();

export const state = {
  connected: false,
  groups: [],
  qr: null,
};

export function setConnected(connected) {
  state.connected = connected;
  if (connected) state.qr = null;
  events.emit('status', { connected: state.connected, groupCount: state.groups.length });
}

export function setGroups(groups) {
  state.groups = groups;
  events.emit('status', { connected: state.connected, groupCount: state.groups.length });
  events.emit('groups', groups);
}

export function setQr(dataUrl) {
  state.qr = dataUrl;
  if (dataUrl) events.emit('qr', { dataUrl });
}

export function emitToast(type, message) {
  events.emit('toast', { type, message });
}
