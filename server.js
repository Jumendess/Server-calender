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

// Função para formatar data
const formatDate = (date) => {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(date).toLocaleDateString('pt-BR', options);
};

const formatTime = (date) => {
  const options = { hour: '2-digit', minute: '2-digit' };
  return new Date(date).toLocaleTimeString('pt-BR', options);
};

// Função para verificar se é um dia útil (segunda a sexta)
const isWeekday = (date) => {
  const dayOfWeek = date.getDay(); // 0 = domingo, 1 = segunda-feira, ..., 6 = sábado
  return dayOfWeek >= 1 && dayOfWeek <= 5; // Retorna true para segunda a sexta
};

// Lista de feriados fixos (exemplo simples)
const holidays = [
  '01-01-2025', // Ano Novo
  '25-12-2025', // Natal
  // Adicione outros feriados aqui
];

// Função para verificar se é feriado
const isHoliday = (date) => {
  const formattedDate = formatDate(date).split(' de ').reverse().join('-'); // Formato: "2025-02-27"
  return holidays.includes(formattedDate);
};

// Função para filtrar horários entre 08:00 e 17:00
const filterBusinessHours = (availableSlots) => {
  return availableSlots.filter(slot => {
    const hour = parseInt(slot.start.split(":")[0], 10); // Pega a hora do horário
    return hour >= 8 && hour < 17; // Só horários entre 08:00 e 17:00
  });
};

app.get('/get-days', async (req, res) => {
  try {
    // Gerar o intervalo de tempo sem limitar as datas
    const startDate = new Date(); // Data atual
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // Para pegar um mês à frente

    const response = await calendar.events.list({
      calendarId: calendarId, // Usando o calendarId do .env
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items;
    const availableDays = [];

    if (events.length === 0) {
      let lastEndTime = startDate;

      // Gerar slots de 30 minutos para o intervalo de 1 mês
      while (lastEndTime < endDate) {
        if (isWeekday(lastEndTime) && !isHoliday(lastEndTime)) {
          const dateKey = formatDate(lastEndTime);
          if (!availableDays.includes(dateKey)) {
            availableDays.push(dateKey);
          }
        }
        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

      res.json({
        status: 'success',
        availableDays: availableDays,
      });
    } else {
      let lastEndTime = startDate;

      events.forEach((event) => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        // Adicionar a data à lista de dias disponíveis se for um dia útil e não for feriado
        const dateKey = formatDate(eventStart);
        if (isWeekday(eventStart) && !isHoliday(eventStart) && !availableDays.includes(dateKey)) {
          availableDays.push(dateKey);
        }

        lastEndTime = eventEnd;
      });

      res.json({
        status: 'success',
        availableDays: availableDays,
      });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/get-events', async (req, res) => {
  try {
    const { day } = req.query; // A data escolhida pelo usuário (ex: "27 de fevereiro de 2025")

    const startDate = new Date(day + 'T00:00:00Z');
    const endDate = new Date(day + 'T23:59:59Z');

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

      // Gerar slots de 30 minutos para o intervalo do dia escolhido
      while (lastEndTime < endDate) {
        availableSlots.push({
          start: formatTime(lastEndTime),
          end: formatTime(new Date(lastEndTime.getTime() + 30 * 60000)),
        });
        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

      // Filtrando horários para somente entre 08:00 e 17:00
      const filteredSlots = filterBusinessHours(availableSlots);

      res.json({
        status: 'success',
        availableSlots: filteredSlots,
      });
    } else {
      let lastEndTime = startDate;

      events.forEach((event) => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        while (lastEndTime < eventStart) {
          availableSlots.push({
            start: formatTime(lastEndTime),
            end: formatTime(new Date(lastEndTime.getTime() + 30 * 60000)),
          });
          lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
        }

        lastEndTime = eventEnd;
      });

      // Filtrando horários para somente entre 08:00 e 17:00
      const filteredSlots = filterBusinessHours(availableSlots);

      res.json({
        status: 'success',
        availableSlots: filteredSlots,
      });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
