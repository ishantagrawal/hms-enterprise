package com.hmsenterprise.portal;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HardwareAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }

}
