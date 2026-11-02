package com.grapevine.app;

import android.app.Application;
import com.google.firebase.FirebaseApp;

public class GrapevineApplication extends Application {
 @Override public void onCreate(){ super.onCreate(); FirebaseApp.initializeApp(this); }
}
