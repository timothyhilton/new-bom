import { createServer } from "http"
import { Server } from "socket.io"
import os from "os"
import fs from "fs"

const allowChangingAnswers = false

const s = {
    house: [],
    controller: [],
    presenter: []
}
const d = new Date()
const httpServer = createServer()
const questions = JSON.parse(fs.readFileSync('../questions.json', 'utf8'))
var answers = JSON.parse(fs.readFileSync('../answers.json', 'utf8'))
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
            onPresenterJoin(socket)
            console.log("presenter joined")
            return
        }

        if(["elliot", "graham", "wesley", "booth"].indexOf(identifier) === -1){
            console.log("unexpected identifier")
            return
        }
        
        onHouseJoin(identifier, socket)
    });
});

var networkInterfaces = os.networkInterfaces()
console.log(networkInterfaces)

httpServer.listen(3000)

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