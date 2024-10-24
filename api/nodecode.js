const express = require('express');
const { Pool, Client } = require('pg'); // PostgreSQL
const cors = require('cors');
const fetch = require('node-fetch'); // For inviting candidates (API request)
const axios = require('axios'); // For fetching test results
const path = require('path'); // For static file handling
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection string
const connectionString = 'postgresql://retool:4zBLlh1TPsAu@ep-frosty-pine-a6aqfk20.us-west-2.retooldb.com/retool?sslmode=require';

// Create a new pool instance
const pool = new Pool({ connectionString });

// iMocha API credentials
const IMOCHA_API_KEY = 'JHuaeAvDQsGfJxlHYpeJwFOxySVrdm'; // Your iMocha API key
const IMOCHA_BASE_URL = 'https://apiv3.imocha.io/v3';

// --- Routes ---

// Route 1: Invite candidate to a test (using iMocha API)
app.post('/invite-candidate', async (req, res) => {
  const targetUrl = 'https://apiv3.imocha.io/v3/tests/1292180/invite';

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': IMOCHA_API_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error inviting candidate:', error);
    res.status(500).json({ error: 'An error occurred while sending the invite' });
  }
});

// Route 2: Update resumes count in the database
// Route 2: Update resumes count in the database
// Route 2: Update resumes count in the database
app.post('/send-resumes-count', async (req, res) => {
  try {
    // Fetch the current rejected and shortlisted counts
    const result = await pool.query('SELECT rejected, shortlisted FROM resume_counts WHERE id = 1');

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No resume count found.' });
    }

    // Log the rejected and shortlisted values for debugging
    console.log('Rejected count:', result.rows[0].rejected);
    console.log('Shortlisted count:', result.rows[0].shortlisted);

    // Calculate the total count by summing rejected and shortlisted columns
    const totalCount = result.rows[0].rejected + result.rows[0].shortlisted + 1;

    // Log the total count to ensure it's calculated correctly
    console.log('Total count:', totalCount);

    // Update the count field in the resume_counts table
    const updateQuery = `UPDATE resume_counts SET count =  $1 WHERE id = 1;`;
    await pool.query(updateQuery, [totalCount]);

    // Send the response back with the updated count
    res.status(200).json({ 
      message: 'Resumes count updated successfully.', 
      count: totalCount // Send the correct total count in the response
    });
  } catch (error) {
    console.error('Error updating resumes count:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});



// Route 3: Insert form data into PostgreSQL (fulfillment form)
app.post('/submit-fulfillment-form', async (req, res) => {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const { job_role, expertise_level, no_of_positions, l_1_panel, l_2_panel, comments } = req.body;

    const insertQuery = `
      INSERT INTO fullfillment_form (job_role, expertise_level, no_of_positions, l_1_panel, l_2_panel, comments)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;

    const result = await client.query(insertQuery, [
      job_role, expertise_level, no_of_positions, l_1_panel, l_2_panel, comments
    ]);

    res.json({ message: 'Form submitted successfully', id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Duplicate entry detected. Please try again.' });
    } else {
      console.error('Error:', error);
      res.status(500).json({ error: 'An error occurred while submitting the form' });
    }
  } finally {
    await client.end();
  }
});
// Route to update the 'resumescount' table
app.post('/update-resumescount', async (req, res) => {
    const { attempted, improvement } = req.body;

    if (typeof attempted !== 'number' || typeof improvement !== 'number') {
        return res.status(400).json({ message: 'Invalid data. Expected numbers for attempted and improvement.' });
    }

    try {
        const query = `
            UPDATE resume_counts
            SET attempted = $1, improvement = $2
            WHERE id = 1;
        `;
        
        // Execute the update query
        await pool.query(query, [attempted, improvement]);

        return res.status(200).json({ message: 'Resumes count updated successfully.' });
    } catch (error) {
        console.error('Error updating resumes count:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});
//shorlisted or rejected
// API to update resume_counts table
app.post('/update-resume-count', async (req, res) => {
    const { field, value } = req.body;

    // Check if the field is valid
    if (field !== 'rejected' && field !== 'shortlisted') {
        return res.status(400).json({ error: 'Invalid field' });
    }

    try {
        // Update the resume_counts table where id = 1 (adjust based on your schema)
        const result = await pool.query(
            `UPDATE resume_counts SET ${field} = ${field} + $1 WHERE id = 1 RETURNING *`,
            [value]
        );

        // Return success response
        res.json({
            message: `${field} count updated successfully`,
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Error updating resume_counts:', error);
        res.status(500).json({ error: 'Failed to update the resume_counts table' });
    }
});
// API to get shortlisted count from the resume_counts table
app.get('/shortlisted-count', async (req, res) => {
    try {
        // Query the database to get the shortlisted count
        const result = await pool.query('SELECT shortlisted FROM resume_counts WHERE id = 1');
        
        // Return the shortlisted count
        res.json({
            shortlisted: result.rows[0].shortlisted
        });
    } catch (error) {
        console.error('Error fetching shortlisted count:', error);
        res.status(500).json({ error: 'Failed to fetch shortlisted count' });
    }
});
// API to get rejected count from the resume_counts table
app.get('/rejected-count', async (req, res) => {
    try {
        // Query the database to get the rejected count
        const result = await pool.query('SELECT rejected FROM resume_counts WHERE id = 1');
        
        // Return the rejected count
        res.json({
            rejected: result.rows[0].rejected
        });
    } catch (error) {
        console.error('Error fetching rejected count:', error);
        res.status(500).json({ error: 'Failed to fetch rejected count' });
    }
});




// Route to get the number of profiles uploaded from the database
app.get('/api/resume-count', async (req, res) => {
    try {
        const result = await pool.query('SELECT count FROM resume_counts WHERE id = 1');
        if (result.rows.length > 0) {
            const count = result.rows[0].count;
            res.json({ count });
        } else {
            res.status(404).json({ message: 'No count found' });
        }
    } catch (error) {
        console.error('Error fetching resume count:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
//candidate-info table
app.post('/add-candidate-info', async (req, res) => {
    const { candidate_name, candidate_email, candidate_status, role, recruitment_phase,reason } = req.body;

    try {
        const query = `
            INSERT INTO candidate_info (candidate_name, candidate_email, candidate_status, role, recruitment_phase,reason)
            VALUES ($1, $2, $3, $4,$5,$6)
            RETURNING *;
        `;
        const values = [candidate_name, candidate_email, candidate_status, role, recruitment_phase,reason];

        const result = await pool.query(query, values);

        res.status(200).json({ success: true, message: 'Candidate info saved', data: result.rows[0] });
    } catch (error) {
        console.error('Error saving candidate information:', error);
        res.status(500).json({ success: false, message: 'Error saving candidate info' });
    }
});

//get Prescreening results in excel
app.get('/download-candidate-info', async (req, res) => {
    try {
        // Query specific columns from the candidate_info table
        const result = await pool.query(
            'SELECT candidate_name, candidate_email, candidate_status, role, reason FROM candidate_info'
        );

        // Create a new workbook and add a worksheet
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(result.rows);

        // Add the worksheet to the workbook
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Candidate Info');

        // Write the workbook to a buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set response headers for download
        res.setHeader('Content-Disposition', 'attachment; filename=Candidate_Info_Report.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Send the buffer as the response
        res.send(buffer);
    } catch (error) {
        console.error('Error fetching data or generating Excel:', error);
        res.status(500).send('Error generating report.');
    }
});
//get candidate info
app.get('/candidate-info', async (req, res) => {
    try {
        // Query data from the candidate_info table
        const result = await pool.query('SELECT * FROM candidate_info');

        // Create a new workbook and add a worksheet
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(result.rows);

        // Add the worksheet to the workbook
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Candidate Info');

        // Write the workbook to a buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set response headers for download
        res.setHeader('Content-Disposition', 'attachment; filename=Candidate_Info_Report.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Send the buffer as the response
        res.send(buffer);
    } catch (error) {
        console.error('Error fetching data or generating Excel:', error);
        res.status(500).send('Error generating report.');
    }
});


// get imochareport
app.get('/Imocha-candidate-info', async (req, res) => {
    try {
        // Query data from the imocha_results table
        const result = await pool.query('SELECT * FROM imocha_results');

        // Iterate over each row to check performance_category and update recruitment_phase and candidate_status in candidate_info
        for (const report of result.rows) {
            const { candidate_email, performance_category } = report;

            // Determine the new recruitment phase and candidate status based on performance_category
            let recruitment_phase = '';
            let candidate_status = ''; // Variable to hold the new status
			let reason = '';

            if (performance_category.toLowerCase() === 'failed') {
                recruitment_phase = 'rejected in l1';
				
				
                candidate_status = 'rejected'; // Update status to 'rejected' for failed candidates
				reason='failed in L1'
            } else if (performance_category.toLowerCase() === 'expert' || performance_category.toLowerCase() === 'need improvements') {
                recruitment_phase = 'move to l2';
				reason='Qualified in L1'
            }

            // Update the recruitment_phase and candidate_status (if applicable) in the candidate_info table for the specific candidate_email
            if (recruitment_phase) {
                await pool.query(
                      'UPDATE candidate_info SET recruitment_phase = $1, candidate_status = COALESCE($2, candidate_status), reason = $3 WHERE candidate_email = $4',
                    [recruitment_phase, candidate_status || null, reason, candidate_email]
                );
            }
        }

        // Create a new workbook and add a worksheet
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(result.rows);

        // Add the worksheet to the workbook
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Imocha Info');

        // Write the workbook to a buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set response headers for download
        res.setHeader('Content-Disposition', 'attachment; filename=Imocha_Info_Report.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Send the buffer as the response
        res.send(buffer);

    } catch (error) {
        console.error('Error fetching data or generating Excel:', error);
        res.status(500).send('Error generating report.');
    }
});


//send candidate details

const transporter = nodemailer.createTransport({
  service: 'gmail', // Use your email service (e.g., Gmail)
  auth: {
    user: 'sapireddyvamsi@gmail.com', // Replace with your email
    pass: 'urvuwnnnmdjwohxp',  // Replace with your email password or app-specific password
  },
});

// Email sending endpoint
app.post('/send-email', (req, res) => {
  const { recipient, data } = req.body;

  const { candidateEmail, score, performanceCategory, testName, pdfReportUrl } = data;

  const mailOptions = {
    from: 'sapireddyvamsi@gmail.com', // Sender address (your email)
    to: recipient,                // Recipient email (user input)
    subject: `Test Results: ${testName}`, // Email subject
    text: `Hello,

Here are the test results for ${testName}:

- Candidate Email: ${candidateEmail}
- Score: ${score}
- Performance Category: ${performanceCategory}

You can download the report here: ${pdfReportUrl}

Best regards,
Your Team`, // Email content
  };

  // Send the email using the transporter
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ message: 'Failed to send email', error });
    }
    console.log('Email sent:', info.response);
    res.status(200).json({ message: 'Email sent successfully' });
  });
});

app.post('/save-imocha-results', async (req, res) => {
  try {
    const reports = req.body.reports; // Get reports array from request body

    // Insert each report into the database
    for (const report of reports) {
      const { candidateEmail, score, totalTestPoints, scorePercentage, performanceCategory, testName, pdfReportUrl } = report;

      // Check if the candidateEmail already exists in the database
      const existingRecord = await pool.query(
        'SELECT * FROM imocha_results WHERE candidate_email = $1',
        [candidateEmail]
      );

      if (existingRecord.rows.length === 0) {
        // If no existing record, insert a new row
        await pool.query(
          `INSERT INTO imocha_results (candidate_email, score, total_test_points, score_percentage, performance_category, test_name, pdf_report_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [candidateEmail, score, totalTestPoints, scorePercentage, performanceCategory, testName, pdfReportUrl]
        );
      } else {
        // If the record already exists, optionally update it if needed
        console.log(`Record for ${candidateEmail} already exists`);
      }
    }

    res.status(200).send('Results saved successfully');
  } catch (error) {
    console.error('Error saving results:', error);
    res.status(500).send('Server error');
  }
});






// Route 4: Fetch test results and reports (iMocha API)
async function getCompletedTestAttempts(testId) {
  try {
    const startDateTime = new Date('2024-09-26T16:00:00Z').toISOString();
    const endDateTime = new Date().toISOString();

    const requestBody = { testId, StartDateTime: startDateTime, EndDateTime: endDateTime };

    const response = await axios.post(`${IMOCHA_BASE_URL}/candidates/testattempts?state=completed`, requestBody, {
      headers: { 'x-api-key': IMOCHA_API_KEY, 'Content-Type': 'application/json' },
    });

    return response.data.result.testAttempts;
  } catch (error) {
    console.error('Error fetching completed test attempts:', error.response?.status, error.response?.data);
    return [];
  }
}

async function getReport(invitationId) {
  try {
    const response = await axios.get(`${IMOCHA_BASE_URL}/reports/${invitationId}`, {
      headers: { 'x-api-key': IMOCHA_API_KEY, 'Content-Type': 'application/json' },
    });

    return response.data;
  } catch (error) {
    console.error(`Error fetching report for invitation ID ${invitationId}:`, error.response?.status, error.response?.data);
    return null;
  }
}

app.get('/api/test-results', async (req, res) => {
  const testId = 1292180;
  const testAttempts = await getCompletedTestAttempts(testId);

  if (testAttempts.length === 0) {
    return res.status(404).json({ message: 'No completed test attempts found.' });
  }

  const reports = [];
  for (const attempt of testAttempts) {
    const report = await getReport(attempt.testInvitationId);
    if (report) {
      reports.push(report);
    }
  }

  res.json(reports);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
