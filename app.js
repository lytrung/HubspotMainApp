
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
function populateCompanies(){       
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
        let data=[]
        
        return Company.find({ 'client_parent_company_id': null, 'right_company_name': null})
        .then(companies=>{
        
            let proms=[]
            for(var i=0;i<companies.length;i++){
                let e = companies[i]
                let prom = Company.find({ 'client_parent_company_id': e.client_company_location_id})
                    .then(children=>{
                            // return children
                        e.children = children
                        data.push(e)
                    
                    })

                proms.push(prom)
            
            }
            return Promise.all(proms)
        })
        .then(()=>{
            // console.log(data)
            return data
        })
       

}

//create parent-child association
function createAssocisations(parentCompanies){
   
    const parent_company_to_child_company  = 13
    var proms=[]
    parentCompanies.forEach(parent=>{

        parent.children.forEach(child=>{

            let data  = {
                fromObjectId: parent.company_id,
                toObjectId: child.company_id,
                category: "HUBSPOT_DEFINED",
                definitionId: parent_company_to_child_company
            }
            // console.log(data)
            
            //create parent-child associations on Hubspot  
            var prom = axios.put(dataServerUrl+'/associations',data)
                .then(response=>console.log(response.data))
            proms.push(prom)
                
        })

    })

    return Promise.all(proms).then(()=>parentCompanies)//dont return till all associations added
                 
}

function updateChildCompanies(parentCompanies){

    var batchData = []
    parentCompanies.forEach(parent=>{

        var data = parent.children.map(child=>{
            return {
                company_id:child.company_id,
                name:child.right_company_name
            }
        })
        batchData = [...batchData,...data]
                
    })
    
    return axios.put(dataServerUrl+'/companies',{batchData})
    .then(response=>{
        console.log(response.data)
        return parentCompanies
    })

    
}

//main funtion
function process(){
    Company.deleteMany({})
        .then(()=>populateCompanies())
        .then(()=> getParentCompanies())
        .then(parentCompanies=>createParentCompanies(parentCompanies))
        .then(()=>Company.deleteMany({}))//to refresh data with newly created keys
        .then(()=>populateCompanies())
        .then(()=>loadParentChild())
        .then(parentCompanies=>updateChildCompanies(parentCompanies))
        .then(parentCompanies=>createAssocisations(parentCompanies))
        

}