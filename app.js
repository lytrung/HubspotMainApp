
const axios = require('axios')
const mongoose = require('mongoose')
const _ = require('lodash');
const Company = require('./company-model.js')

const dataServerUrl = 'http://localhost:4000'

//setup database connection
var connectionString = 'mongodb://admin:pass@cluster0-shard-00-00.qiabj.mongodb.net:27017,cluster0-shard-00-01.qiabj.mongodb.net:27017,cluster0-shard-00-02.qiabj.mongodb.net:27017/testdb?ssl=true&replicaSet=atlas-id226f-shard-0&authSource=admin&retryWrites=true&w=majority'
mongoose.connect(connectionString,{ useNewUrlParser: true })
var  db = mongoose.connection
db.once('open', () => {
    console.log('Database connected')
    process()
})
db.on('error', () => console.log('Database error'))


//to extract data from Hubspot and populate private DB
async function populateCompanies(){
    await Company.deleteMany({})
        
    return axios.get(dataServerUrl+'/companies')
        .then(response =>{
            return response.data
        })
        .then((companies)=>{
            var actions=[]
            for(var i=0; i<companies.length;i++){

                var company = new Company()
                Object.assign(company,companies[i])
                actions.push(company.save())

            }

            return Promise.all(actions)
        })
        .then(a=>{
            console.log('Companies added')
           
        })
}

//work out list of parent companies
function getParentCompanies(){
    var parentCompanies

    const aggregatorOpts = [
        {
            $group: {
                _id: {client_company_location_id:"$client_parent_company_id",company_name:"$company_name"},
                child_count: { $sum: 1 }
            }
        }
    ]

    return Company.aggregate(aggregatorOpts)
        .then(companies=>{
            return companies.filter(company=>company.child_count>1&&company._id.client_company_location_id!=null)
        })
        .then(companies=>{
            
            return companies.map(company=>company._id)
        })

}
//insert parent company to hubspot
function createParentCompanies(parentCompanies){

    var actions=[]
    for (var i = 0; i < parentCompanies.length; i++) {
        var data = parentCompanies[i]
        data.company_name += ' (Parent)' // adding Parent label
        console.log(data)
        var action = axios.post(dataServerUrl+'/companies',data)
        actions.push(action)
    }

    return Promise.all(actions)
    
}

// load parent child relationship
function loadParentChild(){
        var data=[]
        return Company.find({ 'client_parent_company_id': null, 'right_company_name': null})
        .then(companies=>{
            let promises=[]
            companies.forEach(e=>{
            
                let prom =Company.find({ 'client_parent_company_id': e.client_company_location_id})
                .then(children=>{
                    e.children = children
                    data.push(e)
                })
                promises.push(prom)
             
            })

            return Promise.all(promises)
            
        })
        .then(()=>data)
       

}

//create parent-child association
function createAssocisations(parentCompanies){
    const parent_company_to_child_company  = 13
        parentCompanies.forEach(parent=>{

            parent.children.forEach(child=>{

                let data  = {
                    fromObjectId: parent.company_id,
                    toObjectId: child.company_id,
                    category: "HUBSPOT_DEFINED",
                    definitionId: parent_company_to_child_company
                }
                var action = axios.post(dataServerUrl+'/associations',data)     
                axios.put(dataServerUrl+'/associations',data)
                    .then(response=>console.log(response.data))
                    
            })

        })
}

//main funtion
function process(){
    populateCompanies()
        .then(()=> getParentCompanies())
        .then(parentCompanies=>createParentCompanies(parentCompanies))
        .then(()=>populateCompanies())
        .then(()=>loadParentChild())
        .then(parentCompanies=>createAssocisations(parentCompanies))

    loadParentChild().then((parentCompanies)=>{
    })
    
}