import { useRef, useSyncExternalStore } from "react";
import * as Yjs from "yjs";

export const useYArray = (yArray: Yjs.Array<string>) => {
  const cachedMyListRef = useRef<string[]>([]);
  const array = useSyncExternalStore(
    (callback) => {
      yArray.observe(callback);
      return () => yArray.unobserve(callback);
    },
    () => {
      // React requires reference equality
      const newList = yArray.toArray();
      if (JSON.stringify(cachedMyListRef.current) === JSON.stringify(newList)) {
        return cachedMyListRef.current;
      } else {
        cachedMyListRef.current = newList;
        return cachedMyListRef.current;
      }
    },
    () => []
  );
  return array;
};
