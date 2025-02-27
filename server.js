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
    const availableSlots = {};

    // Função para formatar data
    const formatDate = (date) => {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return new Date(date).toLocaleDateString('pt-BR', options);
    };

    if (events.length === 0) {
      let lastEndTime = startDate;

      // Gerar slots de 30 minutos para o intervalo de 27 a 28 de fevereiro
      while (lastEndTime < endDate) {
        const dateKey = formatDate(lastEndTime);
        if (!availableSlots[dateKey]) {
          availableSlots[dateKey] = [];
        }

        availableSlots[dateKey].push({
          start: lastEndTime.toISOString(),
          end: new Date(lastEndTime.getTime() + 30 * 60000).toISOString(),
        });

        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

      res.json({
        status: 'success',
        availableSlots: availableSlots,
      });
    } else {
      let lastEndTime = startDate;

      events.forEach((event) => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        // Adicionar slots de 30 minutos antes do evento
        while (lastEndTime < eventStart) {
          const dateKey = formatDate(lastEndTime);
          if (!availableSlots[dateKey]) {
            availableSlots[dateKey] = [];
          }

          availableSlots[dateKey].push({
            start: lastEndTime.toISOString(),
            end: new Date(lastEndTime.getTime() + 30 * 60000).toISOString(),
          });

          lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
        }

        lastEndTime = eventEnd;
      });

      // Adicionar slots de 30 minutos após o último evento
      while (lastEndTime < endDate) {
        const dateKey = formatDate(lastEndTime);
        if (!availableSlots[dateKey]) {
          availableSlots[dateKey] = [];
        }

        availableSlots[dateKey].push({
          start: lastEndTime.toISOString(),
          end: new Date(lastEndTime.getTime() + 30 * 60000).toISOString(),
        });

        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

      res.json({
        status: 'success',
        availableSlots: availableSlots,
      });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
