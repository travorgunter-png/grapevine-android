package com.grapevine.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class GrapevineFirebaseMessagingService extends FirebaseMessagingService {
 public static final String PREFS="grapevine_push"; public static final String TOKEN="fcm_token";
 @Override public void onNewToken(String token){ super.onNewToken(token); getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString(TOKEN,token).apply(); }
 @Override public void onMessageReceived(RemoteMessage message){
  String title="Grapevine", body="You have a new notification.";
  if(message.getNotification()!=null){ if(message.getNotification().getTitle()!=null)title=message.getNotification().getTitle(); if(message.getNotification().getBody()!=null)body=message.getNotification().getBody(); }
  if(message.getData().containsKey("title"))title=message.getData().get("title"); if(message.getData().containsKey("body"))body=message.getData().get("body");
  NotificationManager nm=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE); String channel="grapevine_updates";
  if(Build.VERSION.SDK_INT>=26){ NotificationChannel ch=new NotificationChannel(channel,"Grapevine notifications",NotificationManager.IMPORTANCE_DEFAULT); nm.createNotificationChannel(ch); }
  Intent intent=new Intent(this,MainActivity.class); intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
  PendingIntent pi=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  NotificationCompat.Builder n=new NotificationCompat.Builder(this,channel).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_DEFAULT);
  nm.notify((int)(System.currentTimeMillis()%Integer.MAX_VALUE),n.build());
 }
}
