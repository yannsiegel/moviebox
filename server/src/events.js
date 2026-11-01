import { EventEmitter } from 'node:events';

/** In-process notifications between modules, e.g. "a new file was found" for the metadata worker. */
export const events = new EventEmitter();
