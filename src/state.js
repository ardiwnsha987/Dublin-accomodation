import { EventEmitter } from 'events';

export const events = new EventEmitter();

export const state = {
  connected: false,
  groups: [],
};

export function setConnected(connected) {
  state.connected = connected;
  events.emit('status', { connected: state.connected, groupCount: state.groups.length });
}

export function setGroups(groups) {
  state.groups = groups;
  events.emit('status', { connected: state.connected, groupCount: state.groups.length });
  events.emit('groups', groups);
}
