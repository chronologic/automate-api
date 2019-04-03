[<img src="https://s3.amazonaws.com/chronologic.network/ChronoLogic_logo.svg" width="128px">](https://github.com/chronologic)

# Automate API

This contains API project for Automate project.

UI project here https://github.com/chronologic/automate-ui

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

## Stack

Typescript
Ethers
Express
MongoDB + Mongoose
