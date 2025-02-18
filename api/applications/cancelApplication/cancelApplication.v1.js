const { getCompany } = require("../../../utils/getCompany");
const { getStudentData } = require("../../../utils/getStudentData");
const knex = require("knex")(require("../../../knexfile").development);

module.exports = async (req, res, next) => {
  try {
    const applicationId = req.params.id;

    if (applicationId == ":id") {
      return res.status(404).json({
        success: false,
        message: "Undefined Parameter(s)."
      })
    }

    const user = req.user;

    let { cancellationReason } = req.body;

    if (
      typeof cancellationReason == "undefined" ||
      typeof cancellationReason == "string"
    ) {
      cancellationReason = null;
    }

    const application = await knex("APPLICATIONS")
      .where({ id: applicationId })
      .select("*")
      .first();

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "This application is not found.",
      });
    }

    const userArray = await getStudentData([application.user_id]);
    const userObj = userArray.items.at(0)

    if (user.studentId !== application.user_id && user.role !== 'applicationAdmin') {
      return res.status(401).json({
        success: false,
        message: "You cannot cancel others application."
      })
    }

    if (application.is_approved) {
      return res.status(409).json({
        success: false,
        message: "You cannot cancel the application that is already approved.",
      });
    }

    if (application.is_canceled) {
      return res.status(409).json({
        success: false,
        message: "You cannot cancel the application that is already canceled.",
      });
    }

    const activityObj = await knex("ACTIVITIES")
      .where("id", application.activity_id)
      .first();

    // check with standard_cancellation_cutoff_hour
    const now = Date.now() + Number(process.env.TIME_OFFSET_MS);
    const nowDateTime = new Date(now);
    let standardCancellationCutoffHour = await knex("SYSTEM_SETTING")
      .where("name", "standard_cancellation_cutoff_hour")
      .first();

    standardCancellationCutoffHour = Number(standardCancellationCutoffHour.value)

    let lastCancellationCutoffHour = await knex("SYSTEM_SETTING")
      .where("name", "last_cancellations_cutoff_hour")
      .first();

    lastCancellationCutoffHour = Number(lastCancellationCutoffHour.value)

    const activityMilliSecondsSinceMidNight =
      (activityObj.start_time.slice(0, 2) * 60 +
        activityObj.start_time.slice(3,5)) *
      60 *
      10;
    const todayMilliSecondsSinceMidNight = now % 86400000;

    const timeAtStandardCancellationCutoffMilliSecond =
      activityMilliSecondsSinceMidNight -
      standardCancellationCutoffHour * 60 * 60 * 1000;

    const timeAtLastCancellationCutoffMilliSecond =
      todayMilliSecondsSinceMidNight -
      lastCancellationCutoffHour * 60 * 60 * 1000;

      console.log("now: ", now);
      console.log("nowDateTime: ", nowDateTime);
      console.log("standardCancellationCutoffHour: ", standardCancellationCutoffHour);
      console.log( "lastCancellationCutoffHour: " , lastCancellationCutoffHour);
      console.log("activityMilliSecondsSinceMidNight: ", activityMilliSecondsSinceMidNight);
      console.log("todayMilliSecondsSinceMidNight: ", todayMilliSecondsSinceMidNight);
      console.log("timeAtStandardCancellationCutoffMilliSecond: ", timeAtStandardCancellationCutoffMilliSecond);
      console.log("timeAtLastCancellationCutoffMilliSecond: ", timeAtLastCancellationCutoffMilliSecond);


    if (now > Date.parse(activityObj.date) + 8640000) {
      return res.status(409).json({
        success: false,
        message: "This activity cancellation is already closed.",
      });
    }

    if (now > Date.parse(activityObj.date)) {
      if (
        todayMilliSecondsSinceMidNight > timeAtLastCancellationCutoffMilliSecond
      ) {
        return res.status(409).json({
          success: false,
          message: "This activity cancellation is already closed.",
        });
      } else if (
        todayMilliSecondsSinceMidNight >
        timeAtStandardCancellationCutoffMilliSecond
      ) {
        if ((cancellationReason = null)) {
          return res.status(400).json({
            success: false,
            message:
              "The cancellationReason is missing. Please provide a reason to cancel this application.",
          });
        }
      }
    }

    const applicationObj = {
      updated_at: nowDateTime,
      is_canceled: true,
      cancellation_reason: cancellationReason,
    };

    let updatedApplication = await knex("APPLICATIONS")
      .where({ id: applicationId })
      .update(applicationObj)
      .returning("*");

    updatedApplication = updatedApplication[0]

    console.log(updatedApplication);

    const activitySemesterObj = await knex("SEMESTERS")
      .where({ id: activityObj.semester_id })
      .select("*")

    const companyObj = await getCompany(activityObj.company_id);

    const applicationRes = {
      id: updatedApplication.id,
      user: {
        id: userObj.id,
        thaiName: userObj.firstNameTh + " " + userObj.lastNameTh,
        studentId: userObj.studentId,
      },
      activity: {
        id: activityObj.id,
        name: activityObj.name,
        company: {
          id: companyObj.id,
          name: companyObj.companyNameTh,
          logoUrl: companyObj.logoUrl,
        },
        semester: {
          year: activitySemesterObj.year,
          semester: activitySemesterObj.semester,
        },
        date: activityObj.date,
      },
      createdAt: updatedApplication.created_at,
      updatedAt: updatedApplication.updated_at,
      isQrGenerated: updatedApplication.is_qr_generated,
      qrString: updatedApplication.qr_string,
      qrGeneratedAt: updatedApplication.qr_generated_at,
      isApproved: updatedApplication.is_approved,
      isCanceled: updatedApplication.is_canceled,
      cancellationReason: updatedApplication.cancellation_reason,
    };

    return res.status(200).json({
      success: true,
      application: applicationRes,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "An error occurred.", error: error.message });
  }
};