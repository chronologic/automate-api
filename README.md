[<img src="https://s3.amazonaws.com/chronologic.network/ChronoLogic_logo.svg" width="128px">](https://github.com/chronologic)

# Sentinel API

This contains API project for Sentinel.

UI project here https://github.com/chronologic/sentinel-ui

## How to start

`yarn install`

To start the express server

`yarn dev`

To create a production build

`yarn build`

## MongoDB

Start MongoDB instance using 

`docker-compose -f mongo.yml up`

or any other instance compatible with `mongodb://root:example@localhost:27017` connection string.

## Deployment

Instructions https://dashboard.heroku.com/apps/cl-sentinel-api/deploy/heroku-git

UI uses `.env.production` to set `REACT_APP_API_URL=https://cl-sentinel-api.herokuapp.com` which is expected URL of API project.

## Stack

Typescript
Ethers
Express
MongoDB + Mongoose
