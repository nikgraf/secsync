FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

COPY . .

EXPOSE $PORT
# necessary for small machines on fly.io to avoid crashing during npm install
ENV NODE_OPTIONS=--max_old_space_size=4096
CMD ["npm", "run", "start:prod" ]