const { getCompany } = require("../../../utils/getCompany");

module.exports = async (req, res, next) => {
  try {
    const companyId = parseInt(req.params.id);
    const companyObj = await getCompany(companyId)
    
    if (!companyObj) throw new Error(`getCompanyV1, Error getting company with id of ${companyId}`)

    return res.status(200).json({
      success: true,
      company: companyObj
    })
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred.",
    });
  }
}