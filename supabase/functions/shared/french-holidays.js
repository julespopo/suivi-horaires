// National holidays applicable in Nièvre. Shared by the browser and reminders.
// Source: https://travail-emploi.gouv.fr/les-jours-feries-et-les-ponts
// UTC arithmetic makes the result independent of the device's timezone and DST.
(function(root){
  const cache=new Map();
  function forYear(year){
    if(cache.has(year))return cache.get(year);
    if(!Number.isInteger(year)||year<1583||year>9999)return Object.freeze({});
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
    const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    const n=h+l-7*m+114,month=Math.floor(n/31),day=n%31+1;
    const easter=Date.UTC(year,month-1,day);
    const offset=days=>new Date(easter+days*86400000).toISOString().slice(0,10);
    const holidays={};
    for(const [date,name] of [['01-01','Jour de l’an'],['05-01','Fête du Travail'],['05-08','Victoire 1945'],['07-14','Fête nationale'],['08-15','Assomption'],['11-01','Toussaint'],['11-11','Armistice 1918'],['12-25','Noël']])holidays[`${year}-${date}`]=name;
    holidays[offset(1)]='Lundi de Pâques';
    holidays[offset(39)]='Ascension';
    holidays[offset(50)]='Lundi de Pentecôte';
    cache.set(year,Object.freeze(holidays));
    return cache.get(year);
  }
  root.FrenchHolidays=Object.freeze({forYear,name:date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?forYear(Number(date.slice(0,4)))[date]||'':''});
})(globalThis);
