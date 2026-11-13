const item=(text,label='',done=false)=>({id:crypto.randomUUID(),text,label,done});
const card=(id,title,type,extra={})=>({id,boardId:'personal',title,type,projectId:null,date:'',pinned:false,body:'',items:[],...extra});
export function createSeed(){
  return {version:1,boards:[{id:'personal',name:'All'}],projects:[{id:'life',boardId:'personal',name:'Life admin'},{id:'trip',boardId:'personal',name:'Weekend away'},{id:'ideas',boardId:'personal',name:'Little projects'}],cards:[
    card('today','Today','checklist',{pinned:true,projectId:'life',items:[item('Pack for the weekend'),item('Make a little space at home'),item('Prepare for tomorrow’s meeting'),item('Take a walk outside'),item('Book a table for Saturday'),item('Finish that book'),item('Pick up a housewarming gift'),item('Back up the photos')]}),
    card('week','This week','week',{pinned:true,items:[item('Plan the week\nChoose three things that matter.','Mon',true),item('10:00 · Team catch-up\nMake room for focused work.','Tue',true),item('Coffee with a friend\nSend the project update.','Wed'),item('Finish the first draft\nAn evening with no plans.','Thu'),item('Wrap up loose ends','Fri'),item('Farmers market\nTry a new recipe','Sat'),item('A slow morning\nLook ahead to next week','Sun')]}),
    card('next','Next week','week',{pinned:true,items:[item('A fresh start','Mon'),item('Make something useful','Tue'),item('Lunch with a friend','Wed'),item('Leave a little breathing room','Thu'),item('Celebrate a small win','Fri'),item('Go somewhere new','Sat'),item('Rest and reset','Sun')]}),
    card('link','Link','link',{url:'https://developer.mozilla.org/',body:'A useful place for the next little project.\n\nKeep the things you want to come back to.',projectId:'ideas'}),
    card('travel','Weekend plans','note',{projectId:'trip',body:'A little change of scenery.\n\nFriday\nLeave after lunch. Take the scenic route.\n\nSaturday\nGood coffee, a long walk, and nowhere to rush.\n\nRemember\nCamera, a warm layer, and a good book.'}),
    card('capture','Capture','note',{body:'Write it down now. Sort it later.\n\nAn idea for the garden.\nThat recommendation from a friend.\nA question worth thinking about.'}),
    card('someday','Someday','checklist',{items:[item('Learn to make fresh pasta'),item('Print a few favorite photos'),item('Plant something on the balcony')]}),
    card('project','Something you keep postponing','note',{projectId:'ideas',body:'One project. One card.\n\nDONE WHEN\nWrite what finished looks like.\n\nNEXT STEP\nThe smallest thing you could do tomorrow.'}),
    card('month','This month','checklist',{items:[item('One thing for home'),item('One thing for yourself'),item('One thing to look forward to')]}),
    card('notes','A little reminder','note',{body:'You don’t need to do everything today.\n\nThree things. A little progress.\nSome room to breathe.'})]};
}
