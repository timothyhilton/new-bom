import { createServer } from "http"
import { Server } from "socket.io"
import os from "os"
import fs from "fs"

const allowChangingAnswers = false

const s = {
    house: [],
    controller: [],
    presenter: [],
    results: []
}
const d = new Date()
const httpServer = createServer()
const questions = JSON.parse(fs.readFileSync('../questions.json', 'utf8'))
var answers = JSON.parse(fs.readFileSync('../answers.json', 'utf8'))
var other = JSON.parse(fs.readFileSync('../other.json', 'utf8'))
var presenterMode = ""
var currentQuestion = null
var timeAtLastChange = 0
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

io.on("connection", (socket) => {
    socket.on("join", (identifier) => {
        if(identifier == "controller"){
            onControllerJoin(socket)
            console.log("controller joined")
            return
        }

        if(identifier == "presenter"){
            if(presenterMode == "results")
                socket.emit("switchScreen", "results")

            onPresenterJoin(socket)
            console.log("presenter joined")
            return
        }

        if(identifier == "results"){
            if(presenterMode == "questions")
                socket.emit("switchScreenn", "questions")

            onResultsJoin(socket)
            console.log("results opened")
            return
        }

        if(["elliot", "graham", "wesley", "booth"].indexOf(identifier) === -1){
            console.log("unexpected identifier")
            return
        }
        
        onHouseJoin(identifier, socket)
    })

    socket.on("switchScreen", (newScreen) => {
        presenterMode = newScreen

        if(newScreen == "questions")
            s.results.forEach(results => results.emit("switchScreen", "questions"))
        else if(newScreen == "results")
            s.presenter.forEach(presenter => presenter.emit("switchScreen", "results"))
    })

    socket.on("updateOffset", (data) => {
        other.pointsOffset[data.houseName] = data.newOffset
        console.log(other)

        fs.writeFileSync('../other.json', JSON.stringify(data, null, 4))
        s.controller.forEach(socket => socket.emit("pointsOffset", ""))
    })
})

var networkInterfaces = os.networkInterfaces()
const privateIPs = Object.values(networkInterfaces)
    .flat()
    .filter(networkInterface => 
        networkInterface.family === 'IPv4' && 
        !networkInterface.internal &&
        (
            networkInterface.address.startsWith('10.') ||
            networkInterface.address.startsWith('172.16.') ||
            networkInterface.address.startsWith('192.168.')
        )
    )
    .map(networkInterface => networkInterface.address)

console.log('possible addresses: ', privateIPs)

httpServer.listen(3000)

function onResultsJoin(socket){
    socket.emit("results", answers)
    s.results.push(socket)
}

function onHouseJoin(houseName, socket){
    socket.emit("displayQuestion", getCurrentQuestion())
    console.log(houseName + " joined")
    socket.on("submitAnswer", onSubmitAnswer)
    s.house.push(socket)
}

function onControllerJoin(socket){
    socket.emit("questions", questions)
    socket.on("changeQuestion", onChangeQuestion)
}

function onPresenterJoin(socket){
    s.presenter.push(socket)
    updateAnswersPresented()
}

function getCurrentQuestion(){
    if(currentQuestion == null) 
        return ({
            "question": "no question selected",
            "answers": []
        })
    else return {...questions[currentQuestion], "t": timeAtLastChange}
}

function updateAnswersPresented(){
    var housesAnswered = []

    answers.filter(a => a.questionIndex == currentQuestion)
        .forEach(a => housesAnswered.push(a.house))

    s.presenter.forEach(presenter => 
        presenter.emit("displayQuestion", {...getCurrentQuestion(), housesAnswered: housesAnswered})
    )
}

function onChangeQuestion(questionIndex){
    currentQuestion = questionIndex
    timeAtLastChange = Date.now()

    s.house.forEach(houseSocket => houseSocket.emit("displayQuestion", getCurrentQuestion()))

    updateAnswersPresented()
}

function onSubmitAnswer({questionName, answer, house}){
    let timeAnswered = Date.now()
    let fullQObject = questions.find(q => q.question == questionName)

    if(timeAnswered > (fullQObject.time_limit + timeAtLastChange)){
        s.house.forEach(socket => socket.emit("confirmAnswer", {success: false, house: house, message: "time limit exceeded"}))
        return
    }
    
    if(!(getCurrentQuestion().question == questionName)){
        s.house.forEach(socket => socket.emit("confirmAnswer", {success: false, house: house, message: "question mismatch"}))
        return
    }
    
    let existingAnswer = answers.find(a => (a.house == house && a.questionName == questionName))
    
    if(existingAnswer && allowChangingAnswers){
        answers = answers.filter(a => a != existingAnswer)
        console.log(house + " successfully changed answers to " + answer)
    }
    else if(existingAnswer) {
        s.house.forEach(socket => socket.emit("confirmAnswer", {success: false, house: house, message: "you cannot change answers"}))
        console.log(house + " attempted to change answers but was blocked")
        return
    }
    
    console.log(house + " answered with option " + answer)
    
    answers.push({
        house: house, 
        questionName: questionName, 
        answer: fullQObject.answers[answer],
        questionIndex: questions.indexOf(fullQObject),
        answerIndex: answer,
        correct: answer == fullQObject.correct_answer,
        time_left: fullQObject.time_limit + timeAtLastChange - timeAnswered
    })

    updateAnswersPresented()
    
    try {
        fs.writeFileSync('../answers.json', JSON.stringify(answers, null, 4))
        s.house.forEach(socket => socket.emit("confirmAnswer", {success: true, house: house}))
    } catch (err) {
        console.error(err);
        s.house.forEach(socket => socket.emit("confirmAnswer", {success: false, house: house, message: "something went very wrong"}))
    }
}