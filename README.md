[<img src="https://s3.amazonaws.com/chronologic.network/ChronoLogic_logo.svg" width="128px">](https://github.com/chronologic)

# Automate API

This contains API project for Automate project.

UI project here https://github.com/chronologic/automate-ui

**LIVE version available here** [https://automate.chronologic.network/](https://automate.chronologic.network/)

**ProductHunt:**[here](https://www.producthunt.com/posts/automate-1)

**Tutorials and help:** [here](https://blog.chronologic.network/automate/home)

## Development

### How to start

`npm install`

To start the express server

`npm run dev`

To create a production build

`npm run build`

### MongoDB

Start MongoDB instance using

`docker-compose -f mongo.yml up`

or any other instance compatible with `mongodb://root:example@localhost:27017` connection string.

### Stack

Typescript
Ethers
Express
MongoDB + Mongoose
