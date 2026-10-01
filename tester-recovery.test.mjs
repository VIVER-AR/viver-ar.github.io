import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TesterReturnRecovery, hasVisiblePalm } from './tester-recovery.js';
import { HandTarget } from './hand-target.js';
import { estimateWristPose, WristPoseTracker } from './pose.js';

test('a brief miss or a visible turning hand keeps its calibration', () => {
  const recovery = new TesterReturnRecovery();
  for (let time = 0; time <= 5000; time += 100) assert.equal(recovery.update({time,calibrated:true,visibleHands:time < 400 ? 0 : 1,accepted:false}),false);
});

test('ordinary successful reacquisition cancels the tester fallback', () => {
  const recovery = new TesterReturnRecovery();
  for(let time=0;time<1200;time+=100) recovery.update({time,calibrated:true,visibleHands:0,accepted:false});
  for(let time=1200;time<4000;time+=100) assert.equal(recovery.update({time,calibrated:true,visibleHands:1,accepted:time===1400}),false);
});

test('a sustained departure allows one fresh calibration if normal recovery stalls', () => {
  const recovery = new TesterReturnRecovery(); let resets=0;
  for(let time=0;time<5000;time+=100) {
    const reset=recovery.update({time,calibrated:resets===0,visibleHands:time<1200?0:1,accepted:false});
    if(reset){assert.equal(time,1800);resets++;}
  }
  assert.equal(resets,1);
});

test('multiple returning hands and intermittent observations cannot trigger a reset', () => {
  const recovery = new TesterReturnRecovery();
  for(let time=0;time<1200;time+=100) recovery.update({time,calibrated:true,visibleHands:0,accepted:false});
  for(let time=1200;time<3000;time+=100) assert.equal(recovery.update({time,calibrated:true,visibleHands:time%300===0?2:1,accepted:false}),false);
  recovery.reset();
  for(const time of [4000,5000,6000]) assert.equal(recovery.update({time,calibrated:true,visibleHands:0,accepted:false}),false);
  for(let time=6100;time<9000;time+=100) assert.equal(recovery.update({time,calibrated:true,visibleHands:1,accepted:false}),false);
});

test('camera/manual resets and uncalibrated startup clear recovery memory', () => {
  for(const reset of [recovery=>recovery.reset(),recovery=>recovery.update({time:1100,calibrated:false,visibleHands:1,accepted:false})]) {
    const recovery = new TesterReturnRecovery();
    for(let time=0;time<=1000;time+=100) recovery.update({time,calibrated:true,visibleHands:0,accepted:false});
    reset(recovery);
    for(let time=1200;time<4000;time+=100) assert.equal(recovery.update({time,calibrated:true,visibleHands:1,accepted:false}),false);
  }
});

function hand(y=.5, scale=1, side='Left') {
  const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
  for(const [i,x,v] of [[0,0,-.04],[1,.025,-.022],[2,.04,0],[3,.052,.022],[4,.06,.038],[5,.035,.04],[9,.012,.04],[13,-.012,.04],[17,-.035,.04]])p[i]={x,y:v,z:0};
  for(const base of [5,9,13,17])for(let j=1;j<=3;j++)p[base+j]={x:p[base].x,y:.04+j*.02,z:0};
  return {landmarks:[p.map(v=>({x:.5+v.x*scale,y:y-v.y*scale,z:0}))],worldLandmarks:[p.map(v=>({x:v.x,y:-v.y,z:0}))],handedness:[[{categoryName:side,score:.99}]]};
}

test('display visibility uses the palm, so cropped fingers or a hidden thumb are not departures', () => {
  const view={width:390,height:844,videoWidth:1000,videoHeight:1000};
  for(const mirror of [false,true]) {
    const points=hand().landmarks[0];points[4].x=-1;points[20].y=2;
    assert.equal(hasVisiblePalm(points,view,mirror),true);
    assert.equal(hasVisiblePalm(hand(-.3).landmarks[0],view,mirror),false);
    assert.equal(hasVisiblePalm(hand().landmarks[0].map(p=>({...p,x:p.x+.5})),view,mirror),false);
    assert.equal(hasVisiblePalm([],view,mirror),false);
  }
});

function replay(enabled, mirror=false, moved=true) {
  const view={width:390,height:844,videoWidth:1000,videoHeight:1000};
  const tracker=new WristPoseTracker(), target=new HandTarget(), recovery=new TesterReturnRecovery();
  let resets=0,firstVisible=null,firstReturn=null;
  for(let time=0;time<=9000;time+=100) {
    // A small but valid hand returns elsewhere in the portrait display. The
    // stale spatial association rejects it even with relocation enabled.
    const result=time<3000?hand(.5):time<4200?{landmarks:[]}:hand(moved ? .83 : .5);
    const index=target.select(result,view,time,{allowRelocation:true});
    const next=index===null?null:estimateWristPose(result.landmarks[index],view,{mirror,worldLandmarks:result.worldLandmarks[index],calibrationBounds:'camera'});
    const accepted=tracker.update(next,time);
    if(enabled&&recovery.update({time,calibrated:!!tracker.orientationSign,accepted,visibleHands:result.landmarks.filter(p=>hasVisiblePalm(p,view,mirror)).length})) {
      resets++;tracker.reset();target.reset();
    }
    if(tracker.sample(time)&&tracker.orientationSign) {
      firstVisible??=time;
      if(time>=4200)firstReturn??=time;
    }
  }
  return {resets,firstVisible,firstReturn};
}

test('a displaced returning hand reacquires only after fresh calibration, on both cameras', () => {
  for(const mirror of [false,true]) {
    const before=replay(false,mirror), after=replay(true,mirror);
    assert.notEqual(before.firstVisible,null);assert.equal(before.firstReturn,null);
    assert.equal(after.resets,1);assert.notEqual(after.firstReturn,null);
    assert.ok(after.firstReturn>=4200+600+1500,'keep the full initial calibration dwell');
  }
});

test('a hand returning to its existing target recovers without resetting its calibration', () => {
  for(const mirror of [false,true]) {
    const result=replay(true,mirror,false);
    assert.notEqual(result.firstReturn,null);assert.equal(result.resets,0);
  }
});
