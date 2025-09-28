import express from "express";
import http from "http";
import { Server } from "socket.io";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["https://translate-app-topaz.vercel.app","http://localhost:3000"],
    methods:["GET","POST"],
    credentials:true,
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 部屋ごとの状態
const rooms = {
  room1:{ users:{1:"ユーザー1",2:"ユーザー2",3:"ユーザー3"}, logs:[] },
  room2:{ users:{1:"ユーザー1",2:"ユーザー2",3:"ユーザー3"}, logs:[] },
  room3:{ users:{1:"ユーザー1",2:"ユーザー2",3:"ユーザー3"}, logs:[] },
};

io.on("connection",(socket)=>{
  console.log("✅ Connected:",socket.id);

  let joinedRoom=null;

  socket.on("join room",({room})=>{
    if(!rooms[room]) return;
    joinedRoom=room;
    socket.join(room);
    socket.emit("init users", rooms[room].users);
    socket.emit("init logs", rooms[room].logs);
  });

  socket.on("leave room",({room})=>{
    socket.leave(room);
    console.log(`🚪 ${socket.id} left ${room}`);
  });

  socket.on("input",({room,userId,text})=>{
    socket.to(room).emit("sync input",{userId,text});
  });

  socket.on("add user",({room})=>{
    const r=rooms[room]; if(!r) return;
    const ids=Object.keys(r.users).map(n=>Number(n));
    if(ids.length>=5) return;
    const newId=Math.max(...ids)+1;
    r.users[newId]=`ユーザー${newId}`;
    io.to(room).emit("users updated",r.users);
  });

  socket.on("remove user",({room})=>{
    const r=rooms[room]; if(!r) return;
    const ids=Object.keys(r.users).map(n=>Number(n)).sort((a,b)=>a-b);
    if(ids.length<=2) return;
    const last=ids[ids.length-1];
    delete r.users[last];
    io.to(room).emit("users updated",r.users);
  });

  socket.on("translate",async({room,userId,text,inputLang,outputLang,model,mode})=>{
    try{
      const sys= mode==="literal"
        ? `Translate into ${outputLang}. Strict literal.`
        : `Translate into ${outputLang}. Natural conversational style.`;

      const completion=await openai.chat.completions.create({
        model,
        messages:[{role:"system",content:sys},{role:"user",content:text}],
        stream:true,
      });

      let acc="";
      for await(const chunk of completion){
        const delta=chunk.choices[0]?.delta?.content||"";
        if(!delta) continue;
        acc+=delta;
        io.to(room).emit("stream result",{userId,partial:acc});
      }

      io.to(room).emit("final result",{userId,result:acc,inputText:text});
      rooms[room].logs.unshift({userId,inputText:text,result:acc});
      if(rooms[room].logs.length>100) rooms[room].logs.length=100;
    }catch(e){
      console.error("Translation error:",e);
      io.to(room).emit("translate error",{userId,message:"翻訳失敗"});
    }
  });

  socket.on("clear logs",({room})=>{
    if(!rooms[room]) return;
    rooms[room].logs=[];
    io.to(room).emit("logs cleared",{});
  });

  socket.on("disconnect",()=>{ console.log("❌ Disconnected:",socket.id); });
});

const PORT=process.env.PORT||10000;
server.listen(PORT,()=>console.log(`🚀 Server on http://localhost:${PORT}`));
