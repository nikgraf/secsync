// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true;
  internalEvents: {
    "": { type: "" };
    "done.invoke.processQueues": {
      type: "done.invoke.processQueues";
      data: unknown;
      __tip: "See the XState TS docs to learn how to strongly type this.";
    };
    "done.invoke.scheduleRetry": {
      type: "done.invoke.scheduleRetry";
      data: unknown;
      __tip: "See the XState TS docs to learn how to strongly type this.";
    };
    "error.platform.processQueues": {
      type: "error.platform.processQueues";
      data: unknown;
    };
    "error.platform.scheduleRetry": {
      type: "error.platform.scheduleRetry";
      data: unknown;
    };
    "xstate.after(0)#syncMachine.connected.checkingForMoreQueueItems": {
      type: "xstate.after(0)#syncMachine.connected.checkingForMoreQueueItems";
    };
    "xstate.init": { type: "xstate.init" };
  };
  invokeSrcNameMap: {
    processQueues: "done.invoke.processQueues";
    scheduleRetry: "done.invoke.scheduleRetry";
  };
  missingImplementations: {
    actions: never;
    delays: never;
    guards: never;
    services: never;
  };
  eventsCausingActions: {
    addToCustomMessageQueue: "WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE";
    addToIncomingQueue: "WEBSOCKET_ADD_TO_INCOMING_QUEUE";
    addToPendingUpdatesQueue: "ADD_CHANGES";
    increaseWebsocketRetry: "WEBSOCKET_RETRY";
    removeOldestItemFromQueueAndUpdateContext: "done.invoke.processQueues";
    resetContext: "DISCONNECT" | "WEBSOCKET_DISCONNECTED";
    resetWebsocketRetries: "WEBSOCKET_CONNECTED";
    spawnWebsocketActor: "WEBSOCKET_RETRY";
    stopWebsocketActor:
      | "DISCONNECT"
      | "WEBSOCKET_DISCONNECTED"
      | "WEBSOCKET_DOCUMENT_ERROR"
      | "WEBSOCKET_DOCUMENT_NOT_FOUND"
      | "WEBSOCKET_UNAUTHORIZED"
      | "error.platform.processQueues";
    storeErrorInErrorTrace: "error.platform.processQueues";
  };
  eventsCausingDelays: {};
  eventsCausingGuards: {
    hasMoreItemsInQueues: "xstate.after(0)#syncMachine.connected.checkingForMoreQueueItems";
    shouldReconnect: "";
  };
  eventsCausingServices: {
    processQueues:
      | "ADD_CHANGES"
      | "WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE"
      | "WEBSOCKET_ADD_TO_INCOMING_QUEUE"
      | "xstate.after(0)#syncMachine.connected.checkingForMoreQueueItems";
    scheduleRetry:
      | ""
      | "CONNECT"
      | "DISCONNECT"
      | "WEBSOCKET_DISCONNECTED"
      | "xstate.init";
  };
  matchesStates:
    | "connected"
    | "connected.checkingForMoreQueueItems"
    | "connected.idle"
    | "connected.processingQueues"
    | "connecting"
    | "connecting.retrying"
    | "connecting.waiting"
    | "disconnected"
    | "failed"
    | "noAccess"
    | {
        connected?: "checkingForMoreQueueItems" | "idle" | "processingQueues";
        connecting?: "retrying" | "waiting";
      };
  tags: never;
}
