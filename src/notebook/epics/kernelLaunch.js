import Rx from 'rxjs/Rx';

import { launch } from 'spawnteract';

import * as uuid from 'uuid';

import {
  createControlSubject,
  createStdinSubject,
  createIOPubSubject,
  createShellSubject,
} from 'enchannel-zmq-backend';

import {
  createMessage,
} from '../api/messaging';

import { setExecutionState, newKernel } from '../actions';

import {
  NEW_KERNEL,
  LAUNCH_KERNEL,
  SET_LANGUAGE_INFO,
  SET_NOTEBOOK,
} from '../constants';

const path = require('path');

export function setLanguageInfo(langInfo) {
  return {
    type: SET_LANGUAGE_INFO,
    langInfo,
  };
}

export function acquireKernelInfo(channels) {
  const { shell } = channels;

  const message = createMessage('kernel_info_request');

  const obs = shell
    .childOf(message)
    .ofMessageType('kernel_info_reply')
    .first()
    .pluck('content', 'language_info')
    .map(setLanguageInfo)
    .cache(1);

  shell.next(message);
  return obs;
}

export function newKernelObservable(kernelSpecName, cwd) {
  return Rx.Observable.create((observer) => {
    launch(kernelSpecName, { cwd })
      .then(c => {
        const { config, spawn, connectionFile } = c;
        const identity = uuid.v4();
        const channels = {
          shell: createShellSubject(identity, config),
          iopub: createIOPubSubject(identity, config),
          control: createControlSubject(identity, config),
          stdin: createStdinSubject(identity, config),
        };

        observer.next({
          type: NEW_KERNEL,
          channels,
          connectionFile,
          spawn,
          kernelSpecName,
        });
      });
  });
}

export const watchExecutionStateEpic = action$ =>
  action$.ofType(NEW_KERNEL)
    .switchMap(action =>
      Rx.Observable.merge(
        action.channels.iopub
          .filter(msg => msg.header.msg_type === 'status')
          .map(msg => setExecutionState(msg.content.execution_state)),
        Rx.Observable.of(setExecutionState('idle'))
      )
    );

export const acquireKernelInfoEpic = action$ =>
  action$.ofType(NEW_KERNEL)
    .switchMap(action =>
      acquireKernelInfo(action.channels)
    );

export const newKernelEpic = action$ =>
  action$.ofType(LAUNCH_KERNEL)
    .do(action => {
      if (!action.kernelSpecName) {
        throw new Error('newKernel needs a kernelSpecName');
      }
    })
    .mergeMap(action =>
      newKernelObservable(action.kernelSpecName, action.cwd)
    );

export const newNotebookKernelEpic = action$ =>
  action$.ofType(SET_NOTEBOOK)
    .do(action => {
      if (!action.data) {
        throw new Error('newNotebookKernel needs notebook data');
      }
    }).map(action => {
      const { filename, data } = action;
      const cwd = (filename && path.dirname(path.resolve(filename))) || process.cwd();
      const kernelName = data.getIn([
        'metadata', 'kernelspec', 'name',
      ], data.getIn([
        'metadata', 'language_info', 'name',
      ], 'python3'));
      return newKernel(kernelName, cwd);
    });