const dbUtils = require('./utils')

module.exports.queryMembers = async function  ({projections = [], filter = {}, elevate = false, grants = {}, userId = ''}) {  
  const villageIdsGranted = Object.keys(grants)
  if (!villageIdsGranted.length && !elevate) {
    return []
  }
  const columns = [
    'CAST(m.id as char) as memberId',
    'm.memberNumber',
  ]


}