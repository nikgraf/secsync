import { useState, useEffect } from "react";

type WebsocketState = {
  connected: boolean;
  connecting: boolean;
  unsuccessfulReconnects: number;
  lastMessageReceived: number;
};

type WebsocketActions =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "reconnecting" };

type SubscriptionCallback = (websocketState: WebsocketState) => void;
type SubscriptionEntry = {
  id: string;
  callback: SubscriptionCallback;
};

let subscriptions: SubscriptionEntry[] = [];
let idCounter = 0;

const websocketInitialState = {
  connected: false,
  connecting: true,
  unsuccessfulReconnects: 0,
  lastMessageReceived: 0,
};

let websocketState = websocketInitialState;

function websocketStateReducer(
  state: WebsocketState,
  action: WebsocketActions
): WebsocketState {
  switch (action.type) {
    case "reconnecting":
      return {
        ...state,
        connected: false,
        connecting: true,
        unsuccessfulReconnects: state.unsuccessfulReconnects + 1,
      };
    case "connected":
      return {
        ...state,
        connected: true,
        connecting: false,
        unsuccessfulReconnects: 0,
        lastMessageReceived: Date.now(),
      };
    case "disconnected":
      return { ...state, connected: false, connecting: false };
    default:
      throw new Error();
  }
}

export const dispatchWebsocketState = (action) => {
  websocketState = websocketStateReducer(websocketState, action);
  subscriptions.forEach((entry) => {
    entry.callback(websocketState);
  });
};

export const getWebsocketState = () => websocketState;

export const subscribeToWebsocketState = (callback: SubscriptionCallback) => {
  idCounter++;
  const id = idCounter.toString();
  subscriptions.push({ id, callback });
  return id;
};

export const unsubscribeToWebsocketState = (subscriptionId) => {
  subscriptions = subscriptions.filter((entry) => entry.id !== subscriptionId);
};

// TODO move to @naisho/react
export const useWebsocketState = () => {
  const [reactWebSocketState, setState] = useState(() => {
    return getWebsocketState();
  });

  useEffect(() => {
    const subscriptionId = subscribeToWebsocketState((websocketState) => {
      setState(websocketState);
    });
    return () => {
      unsubscribeToWebsocketState(subscriptionId);
    };
  }, []);

  return reactWebSocketState;
};
