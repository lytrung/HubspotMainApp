const mongoose = require('mongoose')
const Schema = mongoose.Schema


// this will be our data base's data structure 
const CompanySchema = new Schema(
  {
    // id: Number,
    company_id: Number,
    company_name: String,
    client_company_location_id: Number,
    client_parent_company_id: Number,
    right_company_name: String,
    children:[]

  },
  { 
  	timestamps: true,
  	toJSON: { virtuals: true }
  }
)

// CompanySchema.virtual('fields', {
//   ref: 'Company', // The model to use
//   localField: 'client_company_location_id', 
//   foreignField: 'client_parent_company_id', 
//   justOne: false,
 
// })

// export the new Schema so we could modify it using Node.js
module.exports = mongoose.model('Company', CompanySchema)
