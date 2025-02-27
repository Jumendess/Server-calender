require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const app = express();
const port = 3000;

// Configuração de autenticação com a conta de serviço
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar.readonly']
);

const calendar = google.calendar({ version: 'v3', auth });

// Usando a variável de ambiente para o calendarId
const calendarId = process.env.CALENDAR_ID;

app.get('/get-events', async (req, res) => {
  try {
    const startDate = new Date('2025-02-27T00:00:00Z'); // 27 de fevereiro
    const endDate = new Date('2025-02-28T23:59:59Z'); // 28 de fevereiro

    const response = await calendar.events.list({
      calendarId: calendarId, // Usando o calendarId do .env
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items;
    const availableSlots = [];

    if (events.length === 0) {
      let lastEndTime = startDate;

      while (lastEndTime < endDate) {
        availableSlots.push({
          start: lastEndTime.toISOString(),
          end: new Date(lastEndTime.getTime() + 30 * 60000).toISOString(),
        });
        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

      res.json({
        status: 'success',
        availableSlots: availableSlots
      });

    } else {
      let lastEndTime = startDate;

      events.forEach((event) => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        while (lastEndTime < eventStart) {
          availableSlots.push({
            start: lastEndTime.toISOString(),
            end: new Date(lastEndTime.getTime() + 30 * 60000).toISOString(),
          });
          lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
        }

        lastEndTime = eventEnd;
      });

      while (lastEndTime < endDate) {
        availableSlots.push({
          start: lastEndTime.toISOString(),
          end: new Date(lastEndTime.getTime() + 30 * 60000).toISOString(),
        });
        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

      res.json({
        status: 'success',
        availableSlots: availableSlots
      });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
