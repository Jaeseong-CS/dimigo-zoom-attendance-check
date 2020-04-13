import { Router } from 'express';
import moment from 'moment';
import 'moment-timezone';
import fs from 'fs';
import { promisify } from 'util';
import { getValues, setValues } from '../api/sheet-api';

const router = Router();
const readFileAsync = promisify(fs.readFile);

const SHEET_NAME = '메인';

const getUserIndex = (allData, userName) => {
  const isIncludes = (value) => userName.includes(value[0]) || userName.includes(value[1]);
  const index = allData.findIndex(isIncludes);
  if (index === -1) throw Error(`해당하는 학번, 이름을 찾을 수 없습니다: ${userName}`);
  return index;
};

const parseTime = (joinTime) => {
  const time = moment.tz(joinTime, 'Asia/Seoul');
  return {
    day: time.day(),
    hour: time.hour(),
    minute: time.minute(),
  };
};

const getCurrentSubject = (timeData, now, day) => {
  const {
    timetable, times, startTime, endTime,
  } = timeData;

  if (startTime - 20 <= now && now <= startTime + 5) {
    return '조회';
  }
  if (endTime - 10 <= now && now <= endTime + 20) {
    return '종례';
  }

  const todayTimetable = timetable[day - 1];
  let subject = '';
  times.forEach((time, index) => {
    if (time - 10 <= now && now <= time + 30) {
      subject = todayTimetable[index];
    }
  });
  if (subject !== '') return subject;

  throw Error('출석하는 시간이 아닙니다.');
};

const getParticipantStatus = (minute) => {
  if (minute <= 45) return '출석';
  return '지각';
};

const setUserStatus = async (currentValue, range, value) => {
  if (!currentValue || currentValue === '미출석') {
    await setValues(range, [[value]]);
  }
};

const participantJoined = async (userName, joinTime) => {
  const allData = await getValues(SHEET_NAME);
  const timeData = JSON.parse(await readFileAsync('timetable.json'));
  const userIndex = getUserIndex(allData, userName) + 1;

  const { day, hour, minute } = parseTime(joinTime);

  getCurrentSubject(timeData, hour * 60 + minute, day);

  const participantStatus = getParticipantStatus(minute);

  const column = allData[0].length - 1;
  const currentValue = allData[userIndex - 1][column];

  await setUserStatus(
    currentValue,
    `${SHEET_NAME}!${String.fromCharCode(65 + column)}${userIndex}`,
    `${participantStatus} ${hour}:${minute}`,
  );
};

const webhookReceived = async (data) => {
  if (data.event === 'meeting.participant_joined') {
    const { participant } = data.payload.object;
    const result = await participantJoined(participant.user_name, participant.join_time);
    return result;
  }

  throw Error(`구현되지 않은 이벤트입니다: ${data.event}`);
};

router.post('/', async (req, res) => {
  const data = req.body;
  try {
    await webhookReceived(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
    res.sendStatus(400);
    return;
  }

  res.sendStatus(200);
});

export default router;
