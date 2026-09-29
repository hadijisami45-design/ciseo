export function zonedDateTime(day: string, time: string, zone: string): Date {
  // Resolve a wall-clock time in the salon's zone, including DST transitions.
  const [y,m,d]=day.split('-').map(Number), [h,min]=time.split(':').map(Number)
  const target=Date.UTC(y,m-1,d,h,min)
  let timestamp=target
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  for(let i=0;i<3;i++) {
    const parts=Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]))
    const actual=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute)
    timestamp+=target-actual
  }
  const parts=Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]))
  if(`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`!==`${day} ${time}`) throw new Error('Heure locale inexistante')
  return new Date(timestamp)
}
