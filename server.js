const express = require('express')
const bparser = require('body-parser')
const bcrypt = require('bcrypt-nodejs')
const cors = require('cors');
const knex = require('knex')
const AWS = require('aws-sdk')
const uuidv4 = require('uuid/v4')

const db = knex({
    client: 'pg',
    connection: {
      connectionString : process.env.DATABASE_URL,
      ssl : true
    }
});


const app = express();

app.use(bparser.json());
app.use(cors())


app.get('/',(req,res) =>{
    res.json('memriio is live : 2')
})

app.post('/uploadurl',(req,res) =>{
    const bucket = process.env.S3_BUCKET;
    const key = `${bucket}/${uuidv4()}`
    const url = await AWS.s3
        .getSignedUrl('putObject',{
            Bucket: bucket,
            key: key,
            ContentType: 'image/*',
            Expires: 300,
        })
        .promise();
    res.json(url)

})

app.post('/signin',(req,res) => {
    
    console.log('Sign-in: ',req.body.email) 
    db.select('email','hash').from('login').where({email:req.body.email})
        .then(data=>{
           
        const isValid = bcrypt.compareSync(req.body.password,data[0].hash)
        
        if(isValid){
            return db.select('*').from('users').where({email:req.body.email})
            .then(user =>{
                res.status(200).json(user[0])
            }).catch(err => res.status(400).json('Error Signing In'))  
        }else{
            res.status(401).json('Wrong credentials')
        }
    }).catch(err=> res.status(400).json('wrong Credentials'))
})

app.post('/register',(req,res) => {
    const {email,firstname,lastname,password} = req.body
    const hash = bcrypt.hashSync(password)
    // use transactions to guarentee success accross two tables
    db.transaction(trx =>{
        trx.insert({
            hash:hash,
            email:email,
            password:password
        })
        .into('login')
        .returning('email')
        .then(loginEmail =>{
            return trx('users')
            .returning('*')
            .insert({
                firstname:firstname,
                lastname:lastname,
                email:loginEmail[0],
                joined:new Date()
        })
            .then(user=> {
                res.json(user[0])
            })
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .then()
    
})

app.post('/post',(req,res) => {
    const {ispersonal,userid,groupid} = req.body
    
    db('memories')
        .returning('*')
        .insert({
            createdon:new Date(),
            ispersonal:ispersonal,
            userid:userid,
            groupid:groupid
    })
        .then(memory=> {
            res.json(memory[0]);
        })
        .catch(err=> res.status(400).json('unable to post memory'))
})

app.post('/associate',(req,res) => {
    const {memid,keyword} = req.body
    
    db('memassociates')
        .returning('*')
        .insert({
            memid:memid,
            keywords:keyword
    })
        .then(associate=> {
            res.json(associate[0]);
        })
        .catch(err=> res.status(400).json('unable to associate'))
})

app.get('/profile/:id',(req,res) =>{

    const { id } = req.params;
    
    db.select('*').from('users').where({id:id}).then(users=>{
        if(users.length){
            res.json(users[0])
        }else{
            res.status(400).json('user not found')
        }
    })
    .catch(err=> res.status(400).json('error getting user profile'))
    
})

app.get('/memory/:id',(req,res) =>{

    const { id } = req.params;
    
    db.select('*').from('memories').where({id:id}).then(memories=>{
        if(memories.length){
            res.json(memories[0])
        }else{
            res.status(400).json('memory not found')
        }
    })
    .catch(err=> res.status(400).json('error getting user memory'))
})

app.post('/search',(req,res) =>{

    const {words,user} = req.body

     
    db.select('*').from('memories').whereIn('id',function(){
            this.select('memid').from('memassociates').where('keywords','Like',words.toLowerCase())})
            .andWhere(function(){
                     this.whereIn('memories.groupid',function(){
                         this.select('groupid').from('memberships').where({userid:user})
                     })
                 })
             .union(function(){
                      this.select('*').from('memories').whereIn('id',function(){
                          this.select('memid').from('memassociates').where('keywords','like',words.toLowerCase())
                      .andWhere({groupid:0,userid:user})
                      })
                  })
                
  
        .then(memories=>{
            if(memories.length){
                res.json(memories)
            }else{
                res.status(400).json('no memories found')
            }
        })
    .catch(err=> res.status(400).json('no memories found'))
})

app.post('/searchuser',(req,res) =>{

    const {userid} = req.body
      
    db.select('*').from('memories').where({userid:userid}).orWhereIn('groupid',function(){
            this.select('groupid').from('memberships').where({userid:userid})
    })
        .then(memories=>{
            if(memories.length){
                res.json(memories)
            }else{
                res.status(400).json('no matching memories found')
            }
        })
    .catch(err=> res.status(400).json('error searching memories'))
})


app.listen(process.env.PORT || 3000,()=> {
    console.log('app running on port ${process.env.PORT}');
})

