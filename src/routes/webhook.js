import { Router } from 'express';
import moment from 'moment';
import 'moment-timezone';
import fs from 'fs';
import { promisify } from 'util';
import { getValues, setValues, getColumnName } from '../api/sheet-api';

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

const getCurrentTime = (timeData, now, day) => {
  const {
    timetable, times, startTime, endTime,
  } = timeData;

  if (startTime - 10 <= now && now <= startTime + 5) {
    return '조회';
  }
  if (endTime - 10 <= now && now <= endTime + 5) {
    return '종례';
  }

  const todayTimetable = timetable[day - 1];
  let currentTime;
  times.forEach((time, index) => {
    if (time - 10 <= now && now <= time + 30 && todayTimetable[index] !== '') {
      currentTime = index;
    }
  });
  if (currentTime !== undefined) return currentTime;

  throw Error(`출석하는 시간이 아닙니다: ${Math.floor(now / 60)}시 ${now % 60}분`);
};

const getParticipantStatus = (timeData, now, currentTime) => {
  const { times, startTime, endTime } = timeData;

  let compareTime;
  if (currentTime === '조회') compareTime = startTime;
  else if (currentTime === '종례') compareTime = endTime;
  else compareTime = times[currentTime];

  if (now <= compareTime) return '출석';
  return '지각';
};

const setUserStatus = async (currentValue, range, value) => {
  if (!currentValue || currentValue === '미출석') {
    await setValues(range, [[value]]);
  }
};

const participantJoined = async (userName, joinTime) => {
  const { day, hour, minute } = parseTime(joinTime);
  if (day === 6 || day === 0) throw Error('주말엔 출석을 하지 않습니다.');

  const timeData = JSON.parse(await readFileAsync('timetable.json'));
  const allData = await getValues(SHEET_NAME);
  const userIndex = getUserIndex(allData, userName) + 1;

  const now = hour * 60 + minute;

  const currentTime = getCurrentTime(timeData, now, day);
  const participantStatus = getParticipantStatus(timeData, now, currentTime);

  const currentValue = allData[userIndex - 1][2];

  await setUserStatus(
    currentValue,
    `${SHEET_NAME}!${getColumnName(3)}${userIndex}`,
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
