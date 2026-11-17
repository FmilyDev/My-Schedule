// ข้อมูลตัวอย่างสำหรับปุ่ม "โหลดตัวอย่าง"
export const SAMPLE = {
  courses: [
    {
      code: 'MATH101',
      name: 'แคลคูลัส 1',
      sections: [
        { id: '1', sessions: [{ day: 'MON', start: '09:00', end: '10:30', room: 'SC-201' }, { day: 'WED', start: '09:00', end: '10:30', room: 'SC-201' }] },
        { id: '2', sessions: [{ day: 'TUE', start: '13:00', end: '14:30', room: 'SC-305' }, { day: 'THU', start: '13:00', end: '14:30', room: 'SC-305' }] },
        { id: '3', sessions: [{ day: 'MON', start: '15:00', end: '16:30', room: 'SC-102' }, { day: 'WED', start: '15:00', end: '16:30', room: 'SC-102' }] },
      ],
    },
    {
      code: 'PHY101',
      name: 'ฟิสิกส์ทั่วไป',
      sections: [
        { id: '1', sessions: [{ day: 'MON', start: '10:00', end: '12:00', room: 'PH-1' }, { day: 'FRI', start: '13:00', end: '16:00', room: 'LAB-A' }] },
        { id: '2', sessions: [{ day: 'TUE', start: '09:00', end: '11:00', room: 'PH-2' }, { day: 'THU', start: '09:00', end: '12:00', room: 'LAB-B' }] },
      ],
    },
    {
      code: 'ENG101',
      name: 'ภาษาอังกฤษพื้นฐาน',
      sections: [
        { id: '1', sessions: [{ day: 'TUE', start: '13:00', end: '15:00', room: 'LA-401' }] },
        { id: '2', sessions: [{ day: 'WED', start: '13:00', end: '15:00', room: 'LA-402' }] },
        { id: '3', sessions: [{ day: 'FRI', start: '09:00', end: '11:00', room: 'LA-403' }] },
      ],
    },
    {
      code: 'COM101',
      name: 'การเขียนโปรแกรมเบื้องต้น',
      sections: [
        { id: '1', sessions: [{ day: 'MON', start: '13:00', end: '16:00', room: 'CP-LAB1' }] },
        { id: '2', sessions: [{ day: 'THU', start: '13:00', end: '16:00', room: 'CP-LAB2' }] },
      ],
    },
    {
      code: 'THA101',
      name: 'ภาษาไทยเพื่อการสื่อสาร',
      sections: [
        { id: '1', sessions: [{ day: 'WED', start: '10:30', end: '12:00', room: 'HU-105' }] },
        { id: '2', sessions: [{ day: 'FRI', start: '10:30', end: '12:00', room: 'HU-106' }] },
      ],
    },
  ],
  locks: {},
  prefs: { minimizeGaps: true, preferDaysOff: false, noBefore: '', noAfter: '' },
};
