let idCounter = 0;
export const uniqueId = () => {
  idCounter++;
  return idCounter;
};
