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
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Date(date).toLocaleDateString('en-CA', options); // Retorna no formato AAAA-MM-DD
};

// Função para formatar hora
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
  const formattedDate = formatDate(date).split('-').reverse().join('-'); // Formato: "2025-02-27"
  return holidays.includes(formattedDate);
};

// Função para filtrar horários entre 08:00 e 17:00
const filterBusinessHours = (availableSlots) => {
  return availableSlots.filter(slot => {
    const hour = parseInt(slot.start.split(":")[0], 10); // Pega a hora do horário
    return hour >= 8 && hour < 17; // Só horários entre 08:00 e 17:00
  });
};

// Função para tratar a data e hora da string
const extractDateAndTime = (str) => {
  const datePattern = /(\d{1,2})\sde\s(\w+)\sde\s(\d{4})/; // Exemplo: "05 de maio de 2025"
  const timePattern = /às\s(\d{1,2})h/; // Exemplo: "às 15h"

  // Extrair data
  const dateMatch = str.match(datePattern);
  if (!dateMatch) return { error: 'Data não encontrada' };

  const day = dateMatch[1];
  const month = dateMatch[2];
  const year = dateMatch[3];

  // Converter mês para número
  const months = {
    janeiro: '01', fevereiro: '02', março: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
  };

  const formattedDate = `${year}-${months[month.toLowerCase()]}-${day.padStart(2, '0')}`;

  // Extrair hora
  const timeMatch = str.match(timePattern);
  if (!timeMatch) return { error: 'Hora não encontrada' };

  const hour = timeMatch[1].padStart(2, '0'); // Garante que a hora tenha dois dígitos
  const timeString = `${hour}:00`; // Hora no formato HH:00

  return { date: formattedDate, time: timeString };
};

// Rota para obter os dias disponíveis
app.get('/get-days', async (req, res) => {
  try {
    const startDate = new Date(); // Data atual
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // Para pegar um mês à frente

    const response = await calendar.events.list({
      calendarId: calendarId,
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

// Rota para verificar a disponibilidade de horários
app.get('/get-events', async (req, res) => {
  try {
    const { day } = req.query; // A data escolhida pelo usuário (ex: "27 de fevereiro de 2025")

    const startDate = new Date(day + 'T00:00:00Z');
    const endDate = new Date(day + 'T23:59:59Z');

    const response = await calendar.events.list({
      calendarId: calendarId,
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
          start: formatTime(lastEndTime),
          end: formatTime(new Date(lastEndTime.getTime() + 30 * 60000)),
        });
        lastEndTime = new Date(lastEndTime.getTime() + 30 * 60000);
      }

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

// Rota para verificar a disponibilidade de horário do usuário
app.post('/check-availability', async (req, res) => {
  try {
    const { userRequest } = req.body; // String com a solicitação do usuário (ex: "quero agendar para o dia 05 de maio às 15h")

    const { date, time, error } = extractDateAndTime(userRequest);
    if (error) return res.status(400).json({ error });

    const startDate = new Date(`${date}T${time}:00Z`);
    const endDate = new Date(startDate.getTime() + 30 * 60000); // Evento de 30 minutos

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items;

    if (events.length === 0) {
      res.json({
        status: 'success',
        message: 'Horário disponível',
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Horário já ocupado',
      });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
